import Vida from './vida.ts';
import QrcodeVidaSubComponent from './components/qrcodesubcomponent.ts';
import { svgToDom, extractColors, extractDimensions, loadSvg, colorSvgString, prepareColors, computeCoverSize } from './utils/svgutils.ts';
import { computeRandomDistortedSquare } from './utils/geometry.ts';
import { jsonToURI, stringifyQuery, generateId, overrideValues, pSBC, extractBestTranslation} from './utils/utils.ts'

import compressImage from './compress'
import { buildShape } from './utils/shapes.ts';

import { QR_BODY_SHAPES, QR_FRAME_SHAPES, QR_BALL_SHAPES, qrShapePreview } from './utils/qrstyles.ts';
export { QR_BODY_SHAPES, QR_FRAME_SHAPES, QR_BALL_SHAPES, qrShapePreview };
export { buildShape, Vida, QrcodeVidaSubComponent, svgToDom, extractColors, extractDimensions, loadSvg, colorSvgString, prepareColors, computeCoverSize, computeRandomDistortedSquare, jsonToURI, generateId, stringifyQuery, compressImage, overrideValues, pSBC, extractBestTranslation};