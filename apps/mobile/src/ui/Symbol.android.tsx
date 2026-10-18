import { Icon } from '@expo/ui'
import type { ImageSourcePropType } from 'react-native'
import type { SymbolName } from './symbols'
import garageIcon from '@expo/material-symbols/home.xml'
import logIcon from '@expo/material-symbols/description.xml'
import carIcon from '@expo/material-symbols/directions_car.xml'
import askIcon from '@expo/material-symbols/forum.xml'
import bellIcon from '@expo/material-symbols/notifications.xml'
import personIcon from '@expo/material-symbols/account_circle.xml'
import signOutIcon from '@expo/material-symbols/logout.xml'
import trashIcon from '@expo/material-symbols/delete.xml'
import plusIcon from '@expo/material-symbols/add.xml'
import chevronIcon from '@expo/material-symbols/chevron_right.xml'
import backIcon from '@expo/material-symbols/chevron_left.xml'
import clockIcon from '@expo/material-symbols/schedule.xml'
import warningIcon from '@expo/material-symbols/warning.xml'
import sendIcon from '@expo/material-symbols/arrow_upward.xml'
import stopIcon from '@expo/material-symbols/stop.xml'
import composeIcon from '@expo/material-symbols/edit_square.xml'
import shieldIcon from '@expo/material-symbols/verified_user.xml'
import fuelIcon from '@expo/material-symbols/local_gas_station.xml'
import shareIcon from '@expo/material-symbols/share.xml'
import sourceIcon from '@expo/material-symbols/find_in_page.xml'
import cameraIcon from '@expo/material-symbols/photo_camera.xml'
import photoIcon from '@expo/material-symbols/image.xml'
import engineIcon from '@expo/material-symbols/car_repair.xml'
import quoteIcon from '@expo/material-symbols/assignment.xml'
import receiptIcon from '@expo/material-symbols/receipt_long.xml'
import documentIcon from '@expo/material-symbols/draft.xml'
import folderIcon from '@expo/material-symbols/folder.xml'
import paperclipIcon from '@expo/material-symbols/attach_file.xml'
import downloadIcon from '@expo/material-symbols/download.xml'
import archiveIcon from '@expo/material-symbols/inventory_2.xml'
import checkmarkIcon from '@expo/material-symbols/check_circle.xml'
import ellipsisIcon from '@expo/material-symbols/more_horiz.xml'
import bulletinIcon from '@expo/material-symbols/build.xml'
import gaugeIcon from '@expo/material-symbols/speed.xml'

interface Props {
  name: SymbolName
  size?: number
  color: string
}

// The Material Symbol closest to each SF Symbol in `SYMBOLS`. Imported here rather than listed
// beside the SF Symbols, so only the Android bundle resolves the vector drawables.
const MATERIAL: Record<SymbolName, ImageSourcePropType> = {
  garage: garageIcon,
  log: logIcon,
  car: carIcon,
  ask: askIcon,
  bell: bellIcon,
  person: personIcon,
  signOut: signOutIcon,
  trash: trashIcon,
  plus: plusIcon,
  chevron: chevronIcon,
  back: backIcon,
  clock: clockIcon,
  warning: warningIcon,
  send: sendIcon,
  stop: stopIcon,
  compose: composeIcon,
  shield: shieldIcon,
  fuel: fuelIcon,
  share: shareIcon,
  source: sourceIcon,
  camera: cameraIcon,
  photo: photoIcon,
  engine: engineIcon,
  quote: quoteIcon,
  receipt: receiptIcon,
  document: documentIcon,
  folder: folderIcon,
  paperclip: paperclipIcon,
  download: downloadIcon,
  archive: archiveIcon,
  checkmark: checkmarkIcon,
  ellipsis: ellipsisIcon,
  bulletin: bulletinIcon,
  gauge: gaugeIcon,
}

/**
 * An icon, drawn as its Material Symbol (outlined). Icons sit beside text or inside a labelled
 * button, so TalkBack skips them.
 */
export function Symbol({ name, size = 22, color }: Props) {
  return <Icon name={MATERIAL[name]} size={size} color={color} />
}
