/**
 * PodcastManager — podcast production: episode pipeline from draft through
 * recording, editing, and publishing, guest tracking, per-episode download
 * logging, and show-level performance reporting.
 *
 * Events:
 *   - "podcast.published": { episodeId, title }
 *   - "podcast.downloads_logged": { episodeId, total }
 */
import { randomUUID } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";

export type EpisodeStatus = "draft" | "recorded" | "edited" | "published";

export interface PodcastEpisode {
  id: string;
  title: string;
  guest?: string;
  status: EpisodeStatus;
  durationMinutes?: number;
  publishedAt?: string;
  downloads: number;
}

export interface PodcastSummary {
  totalEpisodes: number;
  published: number;
  inProduction: number;
  totalDownloads: number;
  avgDownloadsPerPublished: number;
  topEpisode?: string;
}

export class PodcastManager {
  private episodes: Map<string, PodcastEpisode> = new Map();

  constructor(private readonly bus: EventBus) {}

  draft(title: string, guest?: string): PodcastEpisode {
    const episode: PodcastEpisode = { id: randomUUID(), title, guest, status: "draft", downloads: 0 };
    this.episodes.set(episode.id, episode);
    return episode;
  }

  markRecorded(episodeId: string, durationMinutes: number): PodcastEpisode | undefined {
    const e = this.episodes.get(episodeId);
    if (!e || e.status !== "draft" || durationMinutes <= 0) return undefined;
    e.status = "recorded";
    e.durationMinutes = durationMinutes;
    return e;
  }

  markEdited(episodeId: string, finalDurationMinutes?: number): PodcastEpisode | undefined {
    const e = this.episodes.get(episodeId);
    if (!e || e.status !== "recorded") return undefined;
    e.status = "edited";
    if (finalDurationMinutes !== undefined && finalDurationMinutes > 0) e.durationMinutes = finalDurationMinutes;
    return e;
  }

  publish(episodeId: string, publishedAt: string): PodcastEpisode | undefined {
    const e = this.episodes.get(episodeId);
    if (!e || e.status !== "edited") return undefined;
    e.status = "published";
    e.publishedAt = publishedAt;
    this.bus.publish("podcast.published", { episodeId, title: e.title });
    return e;
  }

  logDownloads(episodeId: string, count: number): PodcastEpisode | undefined {
    const e = this.episodes.get(episodeId);
    if (!e || e.status !== "published" || count <= 0) return undefined;
    e.downloads += count;
    this.bus.publish("podcast.downloads_logged", { episodeId, total: e.downloads });
    return e;
  }

  getEpisode(id: string): PodcastEpisode | undefined { return this.episodes.get(id); }
  listEpisodes(status?: EpisodeStatus): PodcastEpisode[] {
    const all = Array.from(this.episodes.values());
    return status ? all.filter(e => e.status === status) : all;
  }

  summary(): PodcastSummary {
    const episodes = Array.from(this.episodes.values());
    const published = episodes.filter(e => e.status === "published");
    const totalDownloads = episodes.reduce((s, e) => s + e.downloads, 0);
    const top = [...published].sort((a, b) => b.downloads - a.downloads)[0];
    return {
      totalEpisodes: episodes.length,
      published: published.length,
      inProduction: episodes.length - published.length,
      totalDownloads,
      avgDownloadsPerPublished: published.length > 0 ? Math.round(totalDownloads / published.length) : 0,
      topEpisode: top?.title,
    };
  }
}
