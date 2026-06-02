const q =
  'query( $search: SearchInput $limit: Int $page: Int $translationType: VaildTranslationTypeEnumType $countryOrigin: VaildCountryOriginEnumType ) { shows( search: $search limit: $limit page: $page translationType: $translationType countryOrigin: $countryOrigin ) { edges { _id name availableEpisodes __typename } } }';
const v = {
  search: { allowAdult: false, allowUnknown: false, query: process.argv[2] || 'Dandadan' },
  limit: 40,
  page: 1,
  translationType: process.argv[3] || 'sub',
  countryOrigin: 'ALL',
};
console.log(
  'https://api.allanime.day/api?variables=' +
    encodeURIComponent(JSON.stringify(v)) +
    '&query=' +
    encodeURIComponent(q),
);
