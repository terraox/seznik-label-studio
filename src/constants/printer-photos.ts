import type { ImageSourcePropType } from 'react-native';

import type { ConsumerPrinterId } from '@/constants/printer-models';

/** Small copies of the printer photos (300px): the full 1024px PNGs decode slowly for a small tile. */
export const PRINTER_PHOTOS: Record<ConsumerPrinterId, ImageSourcePropType> = {
  tejas: require('../../assets/images/notice/printer_tejas.png'),
  rudra: require('../../assets/images/notice/printer_rudra.png'),
  josh: require('../../assets/images/notice/printer_josh.png'),
};
