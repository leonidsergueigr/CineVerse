import Image from "next/image";

type Props = {
  className?: string;
  responsive?: boolean;
  size?: "small" | "default" | "large";
  priority?: boolean;
};

const sizeClasses = {
  small: {
    mark: "h-7 w-7",
    word: "text-lg",
  },
  default: {
    mark: "h-8 w-8",
    word: "text-xl",
  },
  large: {
    mark: "h-10 w-10",
    word: "text-2xl sm:text-3xl",
  },
};

export function CineVerseLogo({
  className = "",
  responsive = false,
  size = "default",
  priority = false,
}: Props) {
  const styles = sizeClasses[size];

  return (
    <span
      aria-label="CineVerse"
      className={`inline-flex shrink-0 items-center gap-2 ${className}`}
    >
      <Image
        src="/brand/cineverse-mark.svg"
        alt=""
        aria-hidden="true"
        width={40}
        height={40}
        priority={priority}
        className={`${styles.mark} shrink-0`}
      />
      <span
        aria-hidden="true"
        className={`${responsive ? "hidden sm:inline" : "inline"} ${styles.word} whitespace-nowrap font-extrabold tracking-[0.06em] text-zinc-100`}
      >
        Cine<span className="text-[#f20d19]">Verse</span>
      </span>
    </span>
  );
}
