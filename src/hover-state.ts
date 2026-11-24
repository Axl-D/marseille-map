export type PanelState = {
  pinned: number | null;
  shown: number | null;
};

export function hoverMove(state: PanelState, id: number): PanelState {
  return { pinned: state.pinned, shown: id };
}

export function hoverLeave(state: PanelState): PanelState {
  return { pinned: state.pinned, shown: state.pinned };
}

export function pinQuartier(id: number): PanelState {
  return { pinned: id, shown: id };
}

export function unpin(): PanelState {
  return { pinned: null, shown: null };
}
