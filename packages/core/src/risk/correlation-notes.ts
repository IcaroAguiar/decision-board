export function addUniqueNote(notes: string[], note: string): void {
	if (!notes.includes(note)) notes.push(note);
}
