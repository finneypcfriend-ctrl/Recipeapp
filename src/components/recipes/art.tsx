import { Play } from "lucide-react";
import { useState } from "react";
import { COURSE_EMOJI } from "@/lib/recipes/classify";

const PLACEHOLDER_CLASS: Record<string, string> = {
  Main: "ph-main",
  Side: "ph-side",
  Dessert: "ph-dessert",
  Soup: "ph-soup",
  Salad: "ph-salad",
  "Sauce & Condiment": "ph-sauce",
  "Appetizer & Snack": "ph-snack",
  Breakfast: "ph-breakfast",
  "Bread & Baking": "ph-bread",
  "How-to & Other": "ph-howto",
};

export function RecipeArt({
  title,
  course,
  thumb,
  videoThumb = false,
  custom = false,
  videoUrl,
  eager = false,
  framed = false,
}: {
  title: string;
  course: string;
  thumb: string | null;
  videoThumb?: boolean;
  custom?: boolean;
  videoUrl?: string | null;
  eager?: boolean;
  framed?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(thumb) && !failed;
  const tone = PLACEHOLDER_CLASS[course] ?? "ph-howto";

  return (
    <div className="relative h-full w-full overflow-hidden">
      {showImage ? (
        <img
          src={thumb ?? undefined}
          alt=""
          loading={eager ? "eager" : "lazy"}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className={`flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center text-white ${tone}`}>
          <span className="text-4xl leading-none" aria-hidden="true">
            {COURSE_EMOJI[course] ?? "🍽️"}
          </span>
          <span className="line-clamp-3 font-display text-sm font-semibold leading-snug sm:text-base">{title}</span>
        </div>
      )}
      {custom ? (
        <span className="absolute top-2 left-2 rounded-full bg-gold-bg px-2 py-0.5 text-xs font-semibold tracking-wide text-gold uppercase">
          Custom
        </span>
      ) : null}
      {videoThumb ? (
        videoUrl ? (
          <a
            href={videoUrl}
            target="_blank"
            rel="noreferrer"
            className="absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-full bg-ink/75 text-surface"
            aria-label="Watch video"
          >
            <Play className="size-4 fill-current" aria-hidden="true" />
          </a>
        ) : (
          <span className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-full bg-ink/75 text-surface" aria-hidden="true">
            <Play className="size-3.5 fill-current" />
          </span>
        )
      ) : null}
    </div>
  );
}
