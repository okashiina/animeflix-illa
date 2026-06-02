import {
  AnimeList,
  AnimeDetails,
  MP4Sources,
  SearchParams,
  DetailsParams,
  MP4Params,
} from './types';

export function scrapeSearch(params: SearchParams): Promise<AnimeList[]>;
export function scrapeAnimeDetails(params: DetailsParams): Promise<AnimeDetails>;
export function scrapeMP4(params: MP4Params): Promise<MP4Sources>;
