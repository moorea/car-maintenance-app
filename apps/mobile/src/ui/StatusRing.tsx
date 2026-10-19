// The web preview has no screen reader wrapper to add. Platform files can't import a file of
// their own name, so the drawing lives in StatusDots.
export { StatusDots as StatusRing, type StatusDotsProps as StatusRingProps } from './StatusDots'
