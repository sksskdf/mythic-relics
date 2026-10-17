import { RELIC_MODELS } from '../voxel/models/relics'
import classes from './classes.json'
import enemies from './enemies.json'
import gods from './gods.json'
import relics from './relics.json'
import { parseGameData } from './schema'

/** 검사를 마친 게임 데이터. 잘못된 데이터면 게임을 불러오는 순간(그리고 빌드·테스트에서) 실패한다. */
export const DATA = parseGameData({ gods, relics, enemies, classes }, Object.keys(RELIC_MODELS))
