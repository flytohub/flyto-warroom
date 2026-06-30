/**
 * muiDatePickerStub — no-op stand-ins for the @mui/x-date-pickers
 * components that `material-react-table` imports at module load.
 *
 * MRT v3 unconditionally imports DatePicker / DateTimePicker / TimePicker
 * from @mui/x-date-pickers so it can render an editable *date* cell variant.
 * The workspace's dense tables are read-only and never configure a date
 * editing component, so that code path is never reached at runtime.
 *
 * @mui/x-date-pickers is a peer dependency of MRT that is not installed in
 * this repo (and cannot be added without churning the locked peer-dep tree).
 * Aliasing the three picker subpaths to this stub lets MRT resolve and bundle
 * cleanly while keeping the editable-date feature inert. If a future feature
 * needs real date editing, install @mui/x-date-pickers and drop the aliases
 * in vite.config.next.ts.
 */
import type { ComponentType } from 'react'

const NoopPicker: ComponentType<Record<string, unknown>> = () => null

export const DatePicker = NoopPicker
export const DateTimePicker = NoopPicker
export const TimePicker = NoopPicker

export default NoopPicker
