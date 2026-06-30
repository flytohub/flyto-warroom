import WarRoomSectionPage from './WarRoomSectionPage';

/** Architecture — codebase bird's-eye technical views (arch-*). Was the
 *  legacy war-room "Architecture" accordion section; now a first-class
 *  module with an inner sub-tab nav. Deep id rides the splat:
 *  /architecture/arch-deps. */
export default function ArchitecturePage() {
  return <WarRoomSectionPage sectionKey="architecture" />;
}
