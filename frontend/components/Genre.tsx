import Link from 'next/link';

export interface GenreProps {
  genre: string;
}

const Genre: React.FC<GenreProps> = ({ genre }) => {
  return (
    <Link href={`/genre/${genre}`} passHref>
      <a className="rounded-full border border-line/70 bg-surface/60 px-3 py-1 text-xs font-medium text-muted backdrop-blur-sm transition duration-200 hover:border-accent/60 hover:bg-surface-2 hover:text-fg sm:text-sm">
        {genre}
      </a>
    </Link>
  );
};

export default Genre;
