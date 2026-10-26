import {AbstractInputSuggest, App, Notice, PluginSettingTab, Setting, TFolder, normalizePath} from "obsidian";
import SimpleTimestampPlugin from "./main";
import {formatNow} from "./time";

export interface SimpleTimestampSettings {
	propertyName: string;
	dateFormat: string;
	createIfMissing: boolean;
	excludedFolders: string[];
	cooldownMinutes: number;
}

export const DEFAULT_SETTINGS: SimpleTimestampSettings = {
	propertyName: "updated",
	// Obsidian's "Date & time" property type (and Dataview) only read this ISO shape as a date.
	dateFormat: "YYYY-MM-DDTHH:mm",
	createIfMissing: false,
	excludedFolders: [],
	cooldownMinutes: 1,
}

// Object.prototype keys that would either poison frontmatter lookups or
// trigger `in`-operator false positives if used as a property name.
const FORBIDDEN_PROPERTY_NAMES = new Set(["__proto__", "constructor", "prototype"]);

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	getSuggestions(query: string): TFolder[] {
		const lower = query.toLowerCase();
		const matches: TFolder[] = [];
		for (const f of this.app.vault.getAllLoadedFiles()) {
			// The vault root can't be excluded, so don't offer it.
			if (f instanceof TFolder && !f.isRoot() && f.path.toLowerCase().includes(lower)) matches.push(f);
		}
		return matches;
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}
}

export class SimpleTimestampSettingTab extends PluginSettingTab {
	plugin: SimpleTimestampPlugin;
	private previewEl?: HTMLElement;
	private previewInterval?: number;

	constructor(app: App, plugin: SimpleTimestampPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		this.stopPreview();

		new Setting(containerEl)
			.setName("Property name")
			.setDesc(
				"The property that will be updated whenever you edit a note."
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
		this.previewEl = this.buildDateFormatPreview(dateFormatSetting);

		new Setting(containerEl)
			.setName("Create property if missing")
			.setDesc(
				"When enabled, the property will be added to any Markdown file you edit, " +
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
			.setDesc("Files in these folders (and their subfolders) will not be stamped. Paths are case-sensitive.")
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
			this.plugin.settings.excludedFolders.forEach((path) => {
				new Setting(listContainer)
					.setName(path)
					.addExtraButton((btn) =>
						btn
							.setIcon("trash")
							.setTooltip("Remove")
							.onClick(async () => {
								// Remove by value: a fast double click must not hit the next entry.
								this.plugin.settings.excludedFolders =
									this.plugin.settings.excludedFolders.filter((p) => p !== path);
								await this.plugin.saveSettings();
								renderExcludedList();
							})
					);
			});
		};
		renderExcludedList();

		let addInput: HTMLInputElement;
		const addFolder = async (raw: string) => {
			const value = normalizePath(raw.trim());
			if (value === "/") return;
			if (this.plugin.settings.excludedFolders.includes(value)) {
				new Notice("Already in list.");
				return;
			}
			this.plugin.settings.excludedFolders.push(value);
			await this.plugin.saveSettings();
			addInput.value = "";
			renderExcludedList();
		};
		new Setting(containerEl)
			.setName("Add excluded folder")
			.setDesc("Pick a suggestion, or type a path and press enter.")
			.addText((text) => {
				addInput = text.inputEl;
				const suggest = new FolderSuggest(this.app, text.inputEl);
				suggest.onSelect((folder) => {
					suggest.close();
					void addFolder(folder.path);
				});
				// While suggestions are open, Obsidian's keymap consumes Enter and routes it to onSelect.
				text.inputEl.addEventListener("keydown", (evt) => {
					if (evt.key === "Enter" && !evt.isComposing) void addFolder(text.inputEl.value);
				});
				text.setPlaceholder("Folder/subfolder");
			})
			.addButton((btn) =>
				btn
					.setButtonText("Add")
					.setCta()
					.onClick(() => addFolder(addInput.value))
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
			.setDesc("Skip stamping a file that was already stamped within this many minutes. Set to 0 to disable throttling.")
			.addSlider((slider) =>
				slider
					.setLimits(0, 60, 1)
					.setValue(this.plugin.settings.cooldownMinutes)
					// Deprecated in 1.13, which shows the value inline; older versions only show it through this tooltip.
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.cooldownMinutes = value;
						await this.plugin.saveSettings();
					})
			);


		this.renderPreview();
		// Tick every second so formats with seconds stay live; editing the format re-renders at once.
		this.previewInterval = window.setInterval(() => this.renderPreview(), 1000);
	}

	hide(): void {
		this.stopPreview();
	}

	private renderPreview(): void {
		this.previewEl?.setText(formatNow(this.plugin.settings.dateFormat));
	}

	private stopPreview(): void {
		if (this.previewInterval !== undefined) {
			window.clearInterval(this.previewInterval);
			this.previewInterval = undefined;
		}
	}

	private buildDateFormatSetting(containerEl: HTMLElement): Setting {
		const dateFormatSetting = new Setting(containerEl)
			.setName("Date format")
			.setDesc(
				"Any Moment.js format string. "
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.dateFormat)
					.setValue(this.plugin.settings.dateFormat === DEFAULT_SETTINGS.dateFormat ? "" : this.plugin.settings.dateFormat)
					.onChange(async (value) => {
						this.plugin.settings.dateFormat =
							value.trim() || DEFAULT_SETTINGS.dateFormat;
						this.renderPreview();
						await this.plugin.saveSettings();
					})
			);

		dateFormatSetting.descEl.createEl("a", {
			text: "Syntax reference",
			href: "https://momentjs.com/docs/#/displaying/format/"
		});
		return dateFormatSetting;
	}

	private buildDateFormatPreview(dateFormatSetting: Setting): HTMLElement {
		const livePreviewEl = dateFormatSetting.descEl.createDiv({
			cls: "setting-item-description",
		});
		livePreviewEl.createSpan({text: "Preview: "});

		const previewValue = livePreviewEl.createSpan();
		previewValue.addClass("simple-timestamp-preview-value");

		return previewValue;
	}
}
