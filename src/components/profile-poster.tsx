"use client";

import Image from "next/image";
import { useState } from "react";

export function ProfilePoster({
  posterPath,
  title,
}: {
  posterPath: string | null;
  title: string;
}) {
  const [failed, setFailed] = useState(false);
  const source = normalizePosterSource(posterPath);

  if (!source || failed) {
    return (
      <span className="poster-fallback grid h-24 w-16 place-items-end overflow-hidden rounded p-1 text-[9px] font-bold">
        <span className="line-clamp-3">{title}</span>
      </span>
    );
  }

  if (!source.startsWith("https://image.tmdb.org/")) {
    return (
      // Provider posters can use rotating hosts that cannot be declared in advance.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={source}
        alt={`Affiche de ${title}`}
        width={64}
        height={96}
        onError={() => setFailed(true)}
        className="aspect-[2/3] h-24 w-16 rounded object-cover"
      />
    );
  }

  return (
    <Image
      src={source}
      alt={`Affiche de ${title}`}
      width={64}
      height={96}
      sizes="64px"
      unoptimized
      onError={() => setFailed(true)}
      className="aspect-[2/3] h-24 w-16 rounded object-cover"
    />
  );
}

function normalizePosterSource(value: string | null) {
  const source = value?.trim();
  if (!source) return null;
  if (/^https?:\/\//i.test(source)) return source;
  return `https://image.tmdb.org/t/p/w185${
    source.startsWith("/") ? source : `/${source}`
  }`;
}
