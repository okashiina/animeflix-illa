import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Image from 'next/image';

import { AnimeInfoFragment } from '@animeflix/api/aniList';
import { EmojiSadIcon } from '@heroicons/react/solid';
import { NextSeo } from 'next-seo';

import Card from '@components/anime/Card';
import Header from '@components/Header';
import progressBar from '@components/Progress';

// Character detail page — mirrors /staff/[id] and /studio/[id]. AniList has no
// generated SDK op for a single Character, and the frontend consumes
// @animeflix/api as a built dist (so adding one would need a codegen + rebuild),
// so this fetches AniList directly for the exact AnimeInfo fields Card needs.

const ANILIST_ENDPOINT = 'https://graphql.anilist.co/';

const CHARACTER_PAGE_QUERY = `
query CharacterPage($id: Int) {
  Character(id: $id) {
    id
    name { full native }
    image { large medium }
    description
    media(sort: [POPULARITY_DESC], perPage: 36) {
      edges {
        characterRole
        node {
          id
          idMal
          title { english romaji }
          coverImage { color medium large }
          bannerImage
          format
          episodes
          duration
          meanScore
          nextAiringEpisode { airingAt timeUntilAiring episode }
        }
      }
    }
  }
}`;

interface RawCharacter {
  id: number;
  name?: { full?: string | null; native?: string | null } | null;
  image?: { large?: string | null; medium?: string | null } | null;
  description?: string | null;
  media?: {
    edges?:
      | ({
          characterRole?: string | null;
          node?: AnimeInfoFragment | null;
        } | null)[]
      | null;
  } | null;
}

interface Appearance {
  node: AnimeInfoFragment;
  role: string | null;
}

interface CharacterProps {
  character: {
    id: number;
    full: string | null;
    native: string | null;
    image: string | null;
    bio: string | null;
  };
  appearances: Appearance[];
}

const titleCase = (s: string): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

// AniList bios mix HTML, markdown emphasis, and `~!spoiler!~` sections. Drop the
// spoiler-tagged bits entirely (this is a public page, no progress context) and
// flatten the rest to plain text.
const cleanBio = (raw: string): string =>
  raw
    .replace(/~!([\s\S]*?)!~/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/__|~~|\*\*|\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const getServerSideProps: GetServerSideProps<CharacterProps> = async (
  context
) => {
  const raw = context.params?.id;
  const id = typeof raw === 'string' ? raw : (raw ?? []).join(' ');
  const numericId = parseInt(id, 10);
  if (!Number.isFinite(numericId)) {
    return { notFound: true };
  }

  let character: RawCharacter | null = null;
  try {
    const res = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: CHARACTER_PAGE_QUERY,
        variables: { id: numericId },
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        data?: { Character?: RawCharacter | null } | null;
      };
      character = json.data?.Character ?? null;
    }
  } catch {
    character = null;
  }

  if (!character) {
    return { notFound: true };
  }

  const seen = new Set<number>();
  const appearances: Appearance[] = (character.media?.edges ?? [])
    .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge?.node))
    .map((edge) => ({
      node: edge.node as AnimeInfoFragment,
      role: edge.characterRole ? titleCase(edge.characterRole) : null,
    }))
    .filter((a) => Boolean(a.node.title && a.node.coverImage))
    .filter((a) => {
      if (seen.has(a.node.id)) return false;
      seen.add(a.node.id);
      return true;
    });

  const bioRaw = (character.description || '').trim();
  const bio = bioRaw ? cleanBio(bioRaw) : '';

  return {
    props: {
      character: {
        id: character.id,
        full: character.name?.full ?? null,
        native: character.name?.native ?? null,
        image: character.image?.large ?? character.image?.medium ?? null,
        bio: bio || null,
      },
      appearances,
    },
  };
};

const CharacterPage = ({
  character,
  appearances,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  progressBar.finish();

  const displayName = character.full ?? 'Character';
  const hasAppearances = appearances.length > 0;

  return (
    <>
      <NextSeo title={`${displayName} | kessoku moe`} />

      <Header />

      <main className="mx-auto w-full max-w-screen-2xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <header className="mb-10 flex animate-rise flex-col gap-5 sm:flex-row sm:items-start">
          <span className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-line/40 sm:h-32 sm:w-32">
            {character.image && (
              <Image
                alt={displayName}
                src={character.image}
                layout="fill"
                objectFit="cover"
              />
            )}
          </span>

          <div className="min-w-0">
            <p className="font-sans text-xs font-semibold uppercase tracking-[0.25em] text-accent">
              Character
            </p>
            <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-fg sm:text-3xl lg:text-4xl">
              {displayName}
            </h1>
            {character.native && (
              <p className="mt-1 text-base text-muted">{character.native}</p>
            )}
            {character.bio && (
              <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-muted">
                {character.bio}
              </p>
            )}
          </div>
        </header>

        <div className="mb-6 flex items-center gap-2.5">
          <span className="h-5 w-1 rounded-full bg-aurora" aria-hidden />
          <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
            Appears in
          </h2>
        </div>

        {hasAppearances ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] justify-items-center gap-x-5 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
            {appearances.map((a) => (
              <div key={a.node.id} className="w-36 sm:w-44">
                <Card anime={a.node} />
                {a.role && (
                  <p className="mt-1.5 truncate text-xs text-faint">{a.role}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-line/60 bg-surface/40 px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-faint">
              <EmojiSadIcon className="h-7 w-7" aria-hidden />
            </span>
            <h2 className="mt-5 font-display text-xl font-bold text-fg">
              No appearances listed
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
              We couldn&apos;t pull any anime for this character yet.
            </p>
          </div>
        )}
      </main>
    </>
  );
};

export default CharacterPage;
