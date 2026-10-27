import fetchedVideos from "./youtube-videos.json";
import overrides from "../../youtube/overrides.json";
import { mergeVideos } from "./mergeVideos";

// Hand-curated entries. These keep their own titles and subtitles even once
// the same video arrives from YouTube; the fetched snapshot only fills in what
// is missing here, such as durations and publish dates. Videos uploaded to the
// channels in youtube/channels.json appear without being listed here at all.
const manualVideos = [
  {
    key: "wind-mills-ridge",
    title: "Wind Mills and Ridge",
    subtitle: "Ridgeline run past the wind turbines",
    youtubeId: "r8TWAcgmJpc",
    duration: "7:02",
  },
  {
    key: "olympic-peninsula",
    title: "Exploring the Olympic Peninsula",
    subtitle: "Forest roads, mountain views, and coastal trail segments",
    youtubeId: "4oosjksBYqM",
    duration: "11:35",
  },
  {
    key: "caves-mines-dusty-roads",
    title: "Caves, Mines and Dusty Roads",
    subtitle: "A backcountry route past old mine workings",
    youtubeId: "a1bX5V6n46o",
  },
  {
    key: "moses-lake",
    title: "Moses Lake",
    subtitle: "Open country running east of the Cascades",
    youtubeId: "oXM0UGaxeNc",
  },
  {
    key: "snow-in-june",
    title: "Snow in June",
    subtitle: "Summer trip that ran straight into a snowfield",
    youtubeId: "do8xBZwOFSg",
  },
  {
    key: "snoqualmie-pass",
    title: "Snoqualmie Pass",
    subtitle: "Forest service roads above the pass",
    youtubeId: "cMHkSfrxg8Y",
  },
  {
    key: "stampede-pass-camping",
    title: "Stampede Pass Camping",
    subtitle: "An overnight run with camp set up on the ridge",
    youtubeId: "HboA9XDpJLw",
  },
  {
    key: "next-weekend-crawl",
    title: "Weekend Rock Crawl",
    subtitle: "New upload coming soon",
    youtubeId: "",
  },
];

const videos = mergeVideos(manualVideos, fetchedVideos, overrides);

// Newest playable video, since the merged list is sorted by publish date.
export const featuredVideo = videos.find((video) => video.youtubeId);

export default videos;
