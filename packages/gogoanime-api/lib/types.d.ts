export interface AnimeList {
  animeId: string;
  animeTitle: string;
  animeUrl: string;
  animeImg: string;
  status?: string;
  releasedDate?: string;
}

export interface GogoEpisode {
  episodeId: string;
  episodeNum: string;
  episodeUrl: string;
}

export interface Source {
  file: string;
  label?: string;
  type?: string;
}

export interface MP4Sources {
  Referer: string;
  sources: Source[];
  sources_bk: Source[];
}

export interface AnimeDetails {
  animeTitle: string;
  type?: string;
  releasedDate?: string;
  status?: string;
  genres?: string[];
  otherNames?: string;
  synopsis?: string;
  animeImg?: string;
  totalEpisodes?: number;
  episodesList: GogoEpisode[];
}

export interface SearchParams {
  keyw: string;
  page?: number;
}

export interface DetailsParams {
  id: string;
}

export interface MP4Params {
  id: string;
}
