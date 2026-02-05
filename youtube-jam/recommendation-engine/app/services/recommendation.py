from typing import List, Set
from app.models import Video, UserProfile, InteractionType

class RecommendationEngine:
    def rank_videos(self, candidates: List[Video], profile: UserProfile) -> List[Video]:
        # Ensure preferences are up to date
        profile.calculate_preferences()
        preferences = set(profile.preferred_channels)
        
        liked_ids = set(profile.get_liked_video_ids())
        skipped_ids = set(profile.get_skipped_video_ids())

        scored_candidates = []
        for video in candidates:
            score = 10.0 # Start high
            
            # Boost if already liked (it's a favorite!)
            if video.id in liked_ids:
                score += 2.0 
            
            # Bury if skipped/disliked
            if video.id in skipped_ids:
                score -= 20.0 
            
            # Boost if channel matches preference
            if video.channel_title in preferences:
                score += 5.0
            
            scored_candidates.append((score, video))
            
        scored_candidates.sort(key=lambda x: x[0], reverse=True)
        return [x[1] for x in scored_candidates]
        
    def simple_rerank(self, candidates: List[Video], preferred_channels: Set[str]) -> List[Video]:
        # A helper if we have preferred channels
        scored = []
        for v in candidates:
            score = 1.0
            if v.channel_title in preferred_channels:
                score += 2.0
            scored.append((score, v))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [x[1] for x in scored]
