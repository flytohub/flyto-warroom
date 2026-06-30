import WarRoomSectionPage from './WarRoomSectionPage';

/** Code Scans — IaC / License / Malware / CSPM / Runtime / Reachability
 *  / Red Team / News (sec-*). Was the legacy war-room "Code Scans"
 *  (formerly "Security") accordion section; now a first-class module
 *  with an inner sub-tab nav. Deep id rides the splat:
 *  /code-scans/sec-iac. */
export default function CodeScansPage() {
  return <WarRoomSectionPage sectionKey="security" />;
}
