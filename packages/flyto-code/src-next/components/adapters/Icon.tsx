/**
 * Icon adapter — product code imports the SVG icon from here, never from
 * `@fuse/*` directly, so the Fuse template stays a swappable dependency
 * (arch Phase 4). Swapping the icon implementation later = change this one
 * file. Default export keeps the existing `import FuseSvgIcon from '…'` shape.
 */
export { default } from '@fuse/core/FuseSvgIcon'
export type { FuseSvgIconProps } from '@fuse/core/FuseSvgIcon'
