import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Flavor Hunter",
    short_name: "FlavorHunter",
    description: "A search engine for tastes you remember but can't describe.",
    start_url: "/",
    display: "standalone",
    background_color: "#05080d",
    theme_color: "#071018",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  }
}
