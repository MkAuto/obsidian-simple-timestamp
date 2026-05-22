import {App, Notice, PluginSettingTab, Setting, moment} from "obsidian";
import SimpleTimestampPlugin from "./main";

export interface SimpleTimestampSettings {
	propertyName: string;
	dateFormat: string;
	createIfMissing: boolean;
	excludedFolders: string[];
}

export const DEFAULT_SETTINGS: SimpleTimestampSettings = {
	propertyName: "updated",
	dateFormat: "YYYY/MM/DD HH:mm",
	createIfMissing: false,
	excludedFolders: [],
}

// Object.prototype keys that would either poison frontmatter lookups or
// trigger `in`-operator false positives if used as a property name.
const FORBIDDEN_PROPERTY_NAMES = new Set(["__proto__", "constructor", "prototype"]);

export class SimpleTimestampSettingTab extends PluginSettingTab {
	plugin: SimpleTimestampPlugin;
	private previewInterval?: number;

	constructor(app: App, plugin: SimpleTimestampPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl).setName("Simple Timestamp").setHeading();

		new Setting(containerEl)
			.setName("Property name")
			.setDesc(
				"The property that will be updated on every save."
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.propertyName)
					.setValue(this.plugin.settings.propertyName === DEFAULT_SETTINGS.propertyName ? "" : this.plugin.settings.propertyName)
					.onChange(async (value) => {
						const trimmed = value.trim();
						if (trimmed.length > 0 && FORBIDDEN_PROPERTY_NAMES.has(trimmed)) {
							new Notice(`"${trimmed}" is reserved and cannot be used as a property name.`);
							this.plugin.settings.propertyName = DEFAULT_SETTINGS.propertyName;
						} else {
							this.plugin.settings.propertyName = trimmed || DEFAULT_SETTINGS.propertyName;
						}
						await this.plugin.saveSettings();
					})
			);

		const dateFormatSetting = this.buildDateFormatSetting(containerEl);
		const previewEl = this.buildDateFormatPreview(dateFormatSetting);

		const renderPreview = () => {
			previewEl.setText(moment().format(this.plugin.settings.dateFormat));
		};

		new Setting(containerEl)
			.setName("Create property if missing")
			.setDesc(
				"When enabled, the property will be added to any Markdown file on save, " +
				"even if the property does not already exist."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.createIfMissing)
					.onChange(async (value) => {
						this.plugin.settings.createIfMissing = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Excluded folders")
			.setDesc("Files in these folders (and their subfolders) will not be stamped. One path per line.")
			.addTextArea((text) =>
				text
					.setPlaceholder("Templates\nDrafts")
					.setValue(this.plugin.settings.excludedFolders.join("\n"))
					.onChange(async (value) => {
						this.plugin.settings.excludedFolders = value
							.split("\n")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Autofill from template plugins")
			.setDesc(
				"Reads the configuration of the core Templates plugin and Templater (if installed) " +
				"and merges their template folders into the list above."
			)
			.addButton((btn) =>
				btn
					.setButtonText("Autofill")
					.onClick(async () => {
						btn.setDisabled(true);
						try {
							const detected = await this.plugin.detectTemplateFolders();
							if (detected.length === 0) {
								new Notice("No template folders detected.");
								return;
							}
							const before = new Set(this.plugin.settings.excludedFolders);
							const merged = Array.from(new Set([...before, ...detected]));
							const added = merged.length - before.size;
							this.plugin.settings.excludedFolders = merged;
							await this.plugin.saveSettings();
							this.display();
							new Notice(
								added === 0
									? "All detected folders were already in the list."
									: `Added ${added} folder(s): ${detected.filter((f) => !before.has(f)).join(", ")}`
							);
						} finally {
							btn.setDisabled(false);
						}
					})
			);


		renderPreview();
		// Refresh preview every second; clear it when the tab is hidden
		this.previewInterval = window.setInterval(renderPreview, 100);
	}

	hide(): void {
		if (this.previewInterval !== undefined) {
			window.clearInterval(this.previewInterval);
			this.previewInterval = undefined;
		}
	}

	private buildDateFormatSetting(containerEl: HTMLElement): Setting {
		const dateFormatSetting = new Setting(containerEl)
			.setName("Date format")
			.setDesc(
				"For more syntax, refer to "
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.dateFormat)
					.setValue(this.plugin.settings.dateFormat === DEFAULT_SETTINGS.dateFormat ? "" : this.plugin.settings.dateFormat)
					.onChange(async (value) => {
						this.plugin.settings.dateFormat =
							value.trim() || DEFAULT_SETTINGS.dateFormat;
						await this.plugin.saveSettings();
					})
			);

		dateFormatSetting.descEl.createEl("a", {
			text: "format reference",
			href: "https://momentjs.com/docs/#/displaying/format/"
		});
		return dateFormatSetting;
	}

	private buildDateFormatPreview(dateFormatSetting: Setting): HTMLElement {
		const livePreviewEl = dateFormatSetting.descEl.createEl("div", {
			cls: "setting-item-description",
		});
		livePreviewEl.createEl("span", {text: "Preview: "});

		const previewValue = livePreviewEl.createEl("span");
		previewValue.style.color = "var(--color-accent)";

		return previewValue;
	}
}
