import { type LoadState, loadStates } from "./monthly-contribution.js";

export function nextBusyLoadState(current: LoadState, busy: boolean): LoadState {
	if (busy) {
		return loadStates.loading;
	}

	return current === loadStates.error ? current : loadStates.ready;
}

export function resolveListedPortfolioId(
	listed: readonly { id: string }[],
	preferredId: string,
): string | undefined {
	return listed.find((item) => item.id === preferredId)?.id ?? listed[0]?.id;
}
