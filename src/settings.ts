import {AbstractInputSuggest, App, Notice, PluginSettingTab, Setting, TFolder, moment} from "obsidian";
import SimpleTimestampPlugin from "./main";

export interface SimpleTimestampSettings {
	propertyName: string;
	dateFormat: string;
	createIfMissing: boolean;
	excludedFolders: string[];
	cooldownMinutes: number;
}

export const DEFAULT_SETTINGS: SimpleTimestampSettings = {
	propertyName: "updated",
	dateFormat: "YYYY/MM/DD HH:mm",
	createIfMissing: false,
	excludedFolders: [],
	cooldownMinutes: 1,
}

// Object.prototype keys that would either poison frontmatter lookups or
// trigger `in`-operator false positives if used as a property name.
const FORBIDDEN_PROPERTY_NAMES = new Set(["__proto__", "constructor", "prototype"]);

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(app: App, public inputEl: HTMLInputElement) {
		super(app, inputEl);
	}

	getSuggestions(query: string): TFolder[] {
		const lower = query.toLowerCase();
		const matches: TFolder[] = [];
		for (const f of this.app.vault.getAllLoadedFiles()) {
			if (f instanceof TFolder && f.path.toLowerCase().includes(lower)) matches.push(f);
		}
		return matches;
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path || "/");
	}

	selectSuggestion(folder: TFolder): void {
		this.inputEl.value = folder.path;
		this.inputEl.trigger("input");
		this.close();
	}
}

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
			.setDesc("Files in these folders (and their subfolders) will not be stamped.")
			.setHeading();

		const listContainer = containerEl.createDiv();
		const renderExcludedList = () => {
			listContainer.empty();
			if (this.plugin.settings.excludedFolders.length === 0) {
				listContainer.createDiv({
					text: "No folders excluded.",
					cls: "setting-item-description",
				});
				return;
			}
			this.plugin.settings.excludedFolders.forEach((path, idx) => {
				new Setting(listContainer)
					.setName(path)
					.addExtraButton((btn) =>
						btn
							.setIcon("trash")
							.setTooltip("Remove")
							.onClick(async () => {
								this.plugin.settings.excludedFolders.splice(idx, 1);
								await this.plugin.saveSettings();
								renderExcludedList();
							})
					);
			});
		};
		renderExcludedList();

		let addInput: HTMLInputElement;
		new Setting(containerEl)
			.setName("Add excluded folder")
			.setDesc("Start typing to autocomplete an existing folder path.")
			.addText((text) => {
				addInput = text.inputEl;
				new FolderSuggest(this.app, text.inputEl);
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				text.setPlaceholder("path/to/folder");
			})
			.addButton((btn) =>
				btn
					.setButtonText("Add")
					.setCta()
					.onClick(async () => {
						const value = addInput.value.trim();
						if (!value) return;
						if (this.plugin.settings.excludedFolders.includes(value)) {
							new Notice("Already in list.");
							return;
						}
						this.plugin.settings.excludedFolders.push(value);
						await this.plugin.saveSettings();
						addInput.value = "";
						renderExcludedList();
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
							renderExcludedList();
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

		new Setting(containerEl)
			.setName("Minimum minutes between stamps")
			.setDesc("Skip stamping a file that was already stamped within this many minutes. 0 disables throttling.")
			.addSlider((slider) =>
				slider
					.setLimits(0, 60, 1)
					.setValue(this.plugin.settings.cooldownMinutes)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.cooldownMinutes = value;
						await this.plugin.saveSettings();
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
			// eslint-disable-next-line obsidianmd/ui/sentence-case
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
		previewValue.addClass("simple-timestamp-preview-value");

		return previewValue;
	}
}
