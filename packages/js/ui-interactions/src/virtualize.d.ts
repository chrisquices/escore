export type VirtualizerStrategy = "css" | "virtual" | "auto";

export type VirtualizerItem = {
    key: string | number;
    index: number;
    start: number | null;
    size: number | null;
    style: Record<string, string | number>;
};

export type VirtualizerState = {
    strategy: "css" | "virtual";
    items: VirtualizerItem[];
    totalSize: number | null;
    containerStyle: Record<string, string | number>;
    columns: number;
    cellWidth: number;
    cellHeight: number;
    count: number;
    range?: {
        startIndex: number;
        endIndex: number;
    };
};

export type VirtualizerConfig = {
    onChange?: (state: VirtualizerState) => void;
    onError?: (error: { id: string; message: string }) => void;
    gridElement: HTMLElement;
    count?: number;
    getItemKey?: (index: number) => string | number;
    strategy?: VirtualizerStrategy;
    threshold?: number;
    scrollElement?: HTMLElement;
    overscan?: number;
};

export type VirtualizerEngine = {
    getState: () => VirtualizerState;
    subscribe: (listener: (state: VirtualizerState) => void) => () => void;
    scrollToIndex: (index: number) => void;
    scrollToOffset: (offset: number) => void;
    getItemRect: (index: number) => { top: number; left: number; width: number; height: number };
    getIndicesInRect: (rect: { x: number; y: number; width: number; height: number }) => number[];
    destroy: () => void;
};

export function createVirtualizer(config?: VirtualizerConfig): VirtualizerEngine;
