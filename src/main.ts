import {Plugin, TFile, moment, normalizePath} from "obsidian";
import {
	SimpleTimestampSettings,
	SimpleTimestampSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";

export default class SimpleTimestampPlugin extends Plugin {
	settings: SimpleTimestampSettings;

	// Paths currently being written; blocks concurrent stamps on the same file.
	private inFlight = new Set<string>();

	// mtime of our last write per path; lets us identify and skip self-triggered modify events.
	private lastSelfMtime = new Map<string, number>();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SimpleTimestampSettingTab(this.app, this));

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (!(file instanceof TFile) || file.extension !== "md") return;
				if (file.stat.mtime === this.lastSelfMtime.get(file.path)) return;
				this.stampFile(file);
			}),
		);

		// Keep lastSelfMtime in sync with file lifecycle so it doesn't leak entries.
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.lastSelfMtime.delete(file.path);
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				const mt = this.lastSelfMtime.get(oldPath);
				this.lastSelfMtime.delete(oldPath);
				if (mt !== undefined) this.lastSelfMtime.set(file.path, mt);
			}),
		);
	}

	private isInExcludedFolder(file: TFile): boolean {
		const filePath = file.path.toLowerCase();
		for (const raw of this.settings.excludedFolders) {
			const folder = normalizePath(raw).toLowerCase();
			if (folder.length === 0 || folder === "/") continue;
			if (filePath === folder) return true;
			if (filePath.startsWith(folder + "/")) return true;
		}
		return false;
	}

	// Single source of truth: stamp iff the property already exists, or the
	// user has opted in to creating it. Used by both the cache fast-path and
	// the in-callback re-check (which sees fresh disk state). hasOwnProperty
	// (not `in`) avoids false positives against Object.prototype keys.
	private shouldStamp(fm: Record<string, unknown> | undefined): boolean {
		if (fm && Object.prototype.hasOwnProperty.call(fm, this.settings.propertyName)) return true;
		return this.settings.createIfMissing;
	}

	private async stampFile(file: TFile) {
		if (this.inFlight.has(file.path)) return;
		this.inFlight.add(file.path);
		try {
			if (this.isInExcludedFolder(file)) return;

			// Fast-path: metadata cache may lag behind the modify event (a freshly
			// deleted property still appears present), so a positive result is
			// re-verified against disk inside processFrontMatter.
			if (!this.shouldStamp(this.app.metadataCache.getFileCache(file)?.frontmatter)) return;

			const timestamp = moment().format(this.settings.dateFormat);
			await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
				if (!this.shouldStamp(frontmatter)) return;
				frontmatter[this.settings.propertyName] = timestamp;
			});
			// Record the mtime our write produced so the resulting modify event can be identified.
			this.lastSelfMtime.set(file.path, file.stat.mtime);
		} catch (e) {
			console.error("Simple Timestamp: failed to update frontmatter for", file.path, e);
		} finally {
			this.inFlight.delete(file.path);
		}
	}

	// Read Obsidian's plugin config files directly via the public vault
	// adapter. We intentionally avoid `app.internalPlugins` / `app.plugins`
	// (undocumented runtime objects that break silently across versions); the
	// adapter is a documented API and the JSON files are user-readable.
	async detectTemplateFolders(): Promise<string[]> {
		const adapter = this.app.vault.adapter;
		const configDir = this.app.vault.configDir;
		const sources: Array<{ path: string; key: string }> = [
			{ path: `${configDir}/templates.json`, key: "folder" },
			{ path: `${configDir}/plugins/templater-obsidian/data.json`, key: "templates_folder" },
		];

		const found: string[] = [];
		for (const { path, key } of sources) {
			if (!(await adapter.exists(path))) continue;
			try {
				const parsed = JSON.parse(await adapter.read(path)) as Record<string, unknown>;
				const value = parsed[key];
				if (typeof value === "string" && value.length > 0) {
					found.push(value.replace(/\/+$/, ""));
				}
			} catch {
				// Malformed config file; skip silently.
			}
		}
		return found;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
