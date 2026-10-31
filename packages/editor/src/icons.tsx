import { Cube } from "@phosphor-icons/react/dist/csr/Cube";
import { Pill } from "@phosphor-icons/react/dist/csr/Pill";
import { Folder } from "@phosphor-icons/react/dist/csr/Folder";
import { FolderOpen } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { Eye } from "@phosphor-icons/react/dist/csr/Eye";
import { EyeSlash } from "@phosphor-icons/react/dist/csr/EyeSlash";
import { Lightbulb } from "@phosphor-icons/react/dist/csr/Lightbulb";
import { UserCircle } from "@phosphor-icons/react/dist/csr/UserCircle";
import { CircleDashed } from "@phosphor-icons/react/dist/csr/CircleDashed";
import { Play } from "@phosphor-icons/react/dist/csr/Play";
import { Stop } from "@phosphor-icons/react/dist/csr/Stop";
import { Pause } from "@phosphor-icons/react/dist/csr/Pause";
import { ArrowUUpLeft } from "@phosphor-icons/react/dist/csr/ArrowUUpLeft";
import { ArrowUUpRight } from "@phosphor-icons/react/dist/csr/ArrowUUpRight";
import { UploadSimple } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { ArrowSquareOut } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { ArrowsOutCardinal } from "@phosphor-icons/react/dist/csr/ArrowsOutCardinal";
import { ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { BoundingBox } from "@phosphor-icons/react/dist/csr/BoundingBox";
import { SlidersHorizontal } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { Crosshair } from "@phosphor-icons/react/dist/csr/Crosshair";
import { Code } from "@phosphor-icons/react/dist/csr/Code";
import { Terminal } from "@phosphor-icons/react/dist/csr/Terminal";
import { BookOpen } from "@phosphor-icons/react/dist/csr/BookOpen";
import { GridFour } from "@phosphor-icons/react/dist/csr/GridFour";
import { Sphere } from "@phosphor-icons/react/dist/csr/Sphere";
import { Cylinder } from "@phosphor-icons/react/dist/csr/Cylinder";
import { Triangle } from "@phosphor-icons/react/dist/csr/Triangle";
import { CirclesThree } from "@phosphor-icons/react/dist/csr/CirclesThree";
import { TreeStructure } from "@phosphor-icons/react/dist/csr/TreeStructure";
import { Rows } from "@phosphor-icons/react/dist/csr/Rows";
import { Columns } from "@phosphor-icons/react/dist/csr/Columns";
import { ArrowsOut } from "@phosphor-icons/react/dist/csr/ArrowsOut";
import { ArrowsIn } from "@phosphor-icons/react/dist/csr/ArrowsIn";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { SidebarSimple } from "@phosphor-icons/react/dist/csr/SidebarSimple";
import { Stack } from "@phosphor-icons/react/dist/csr/Stack";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { House } from "@phosphor-icons/react/dist/csr/House";
import { FileTs } from "@phosphor-icons/react/dist/csr/FileTs";
import { FloppyDisk } from "@phosphor-icons/react/dist/csr/FloppyDisk";
import { PencilSimple } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { LinkBreak } from "@phosphor-icons/react/dist/csr/LinkBreak";
const icons = {
  cube: Cube,
  capsule: Pill,
  folder: Folder,
  folderOpen: FolderOpen,
  right: CaretRight,
  down: CaretDown,
  plus: Plus,
  trash: Trash,
  copy: Copy,
  eye: Eye,
  eyeOff: EyeSlash,
  light: Lightbulb,
  player: UserCircle,
  sensor: CircleDashed,
  play: Play,
  stop: Stop,
  pause: Pause,
  undo: ArrowUUpLeft,
  redo: ArrowUUpRight,
  upload: UploadSimple,
  download: DownloadSimple,
  external: ArrowSquareOut,
  move: ArrowsOutCardinal,
  rotate: ArrowClockwise,
  scale: BoundingBox,
  settings: SlidersHorizontal,
  focus: Crosshair,
  code: Code,
  console: Terminal,
  guide: BookOpen,
  assets: GridFour,
  sphere: Sphere,
  cylinder: Cylinder,
  cone: Triangle,
  physics: CirclesThree,
  tree: TreeStructure,
  rows: Rows,
  columns: Columns,
  maximize: ArrowsOut,
  minimize: ArrowsIn,
  close: X,
  sidebar: SidebarSimple,
  stack: Stack,
  check: Check,
  up: ArrowUp,
  home: House,
  ts: FileTs,
  save: FloppyDisk,
  rename: PencilSimple,
  unlink: LinkBreak,
};
export type IconName = keyof typeof icons;
export function Icon({ name, size = 15 }: { name: IconName; size?: number }) {
  const Component = icons[name];
  return (
    <Component
      size={size}
      weight="regular"
      aria-hidden="true"
      focusable="false"
      className="app-icon"
    />
  );
}
