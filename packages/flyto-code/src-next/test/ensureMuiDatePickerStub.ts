/**
 * Vitest globalSetup — materialise a stub @mui/x-date-pickers package so
 * material-react-table's CJS `require('@mui/x-date-pickers/DatePicker')`
 * resolves under the test runner.
 *
 * @mui/x-date-pickers is an uninstalled MRT peer (see
 * src-next/lib/shims/muiDatePickerStub.tsx). The vite build redirects the
 * three picker subpaths to the local stub via resolve.alias, and that alias
 * works for ESM imports under vitest too — but MRT ships CJS, and vitest
 * externalises node_modules, so its `require()` hits Node's native resolver
 * which ignores vite aliases. Writing a tiny real package into node_modules
 * satisfies that native require without churning the locked peer-dep tree.
 * Runs once per `vitest run`, so it is CI-safe after a clean `npm ci`.
 */
import fs from 'node:fs'
import path from 'node:path'

export default function setup() {
  const dir = path.resolve(__dirname, '../../node_modules/@mui/x-date-pickers')
  fs.mkdirSync(dir, { recursive: true })

  const pkgPath = path.join(dir, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    fs.writeFileSync(
      pkgPath,
      JSON.stringify({ name: '@mui/x-date-pickers', version: '0.0.0-stub', private: true }, null, 2),
    )
  }

  const body = 'const NoopPicker = () => null;\nmodule.exports = { DatePicker: NoopPicker, DateTimePicker: NoopPicker, TimePicker: NoopPicker, default: NoopPicker };\n'
  for (const file of ['DatePicker.js', 'DateTimePicker.js', 'TimePicker.js']) {
    const fp = path.join(dir, file)
    if (!fs.existsSync(fp)) fs.writeFileSync(fp, body)
  }
}
