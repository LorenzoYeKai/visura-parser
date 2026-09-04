export interface PositionedSpan {
  readonly page: number;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fontName: string;
  readonly hasEol: boolean;
}

export interface ExtractedPage {
  readonly number: number;
  readonly width: number;
  readonly height: number;
  readonly spans: readonly PositionedSpan[];
}

export interface ExtractedPdf {
  readonly pages: readonly ExtractedPage[];
}
