import { createFileRoute } from "@tanstack/react-router";
import { RecipeApp } from "@/components/recipes/app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <RecipeApp />;
}
