// declare module 'simple-pandoc';
declare module 'ps-node'

declare interface String {
  color: any
  actionStartColor(): string
  actionStopColor(): string
  resultHighlighColor(): string
  resultSecondaryColor(): string
  resultNormalColor(): string
  infoColor(): string
  errorColor(): string
}
