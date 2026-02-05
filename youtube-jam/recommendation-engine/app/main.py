from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

from app.models import Video, UserInteraction, UserProfile
from app.services.recommendation import RecommendationEngine
from app.services.youtube import YouTubeClient

app = FastAPI(title="YouTube Jam Recommendation Engine")

# Allow CORS for local React dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Services
youtube_client = YouTubeClient()
recommender = RecommendationEngine()

# In-memory mock DB
user_profiles: dict[str, UserProfile] = {}

class RecommendationRequest(BaseModel):
    user_id: str
    candidate_videos: List[Video] # Videos to sort
    user_interactions: Optional[List[UserInteraction]] = None # Optional client-provided history

@app.get("/")
def read_root():
    return {"message": "Recommendation Engine Ready"}

@app.post("/recommend", response_model=List[Video])
def recommend_videos(req: RecommendationRequest):
    # 1. Get Profile
    profile = user_profiles.get(req.user_id)
    if not profile:
        profile = UserProfile(user_id=req.user_id)
        user_profiles[req.user_id] = profile
    
    # 2. Merge client interactions if provided
    if req.user_interactions:
        # Simple merge: Append new ones that aren't there? 
        # For this stateless style, let's just use what is sent if present, 
        # or use stored if strictly relying on server.
        # Prefer provided interactions for "Re-rank existing lists from frontend" context.
        profile.interactions = req.user_interactions
    
    # 3. Rank
    ranked_videos = recommender.rank_videos(req.candidate_videos, profile)
    return ranked_videos

@app.post("/action")
def record_action(interaction: UserInteraction, user_id: str = "default_user"):
    # 1. Get Profile
    profile = user_profiles.get(user_id)
    if not profile:
        profile = UserProfile(user_id=user_id)
        user_profiles[user_id] = profile
    
    # 2. Add Interaction
    profile.interactions.append(interaction)
    profile.calculate_preferences() # Update persistence
    
    return {"status": "success", "profile_interaction_count": len(profile.interactions)}

# Helper to proxy search if needed, though frontend can do it.
@app.get("/search", response_model=List[Video])
def search_youtube(q: str):
    return youtube_client.search_videos(q)
