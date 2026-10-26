import {moment} from "obsidian";

// Obsidian's typings declare `moment` as a namespace import, which TypeScript 6
// refuses to call (esModuleInterop is always on). At runtime it is the moment
// function itself, so give it a callable type.
const callMoment = moment as unknown as () => ReturnType<typeof moment.utc>;

export function formatNow(format: string): string {
	return callMoment().format(format);
}
