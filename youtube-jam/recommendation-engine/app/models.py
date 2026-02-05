from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum
from datetime import datetime

class InteractionType(str, Enum):
    LIKE = "like"
    DISLIKE = "dislike"
    SKIP = "skip"
    VIEW = "view"

class Video(BaseModel):
    id: str
    title: str
    description: str = ""
    thumbnail_url: str = ""
    channel_title: str = ""
    published_at: Optional[datetime] = None

class UserInteraction(BaseModel):
    video_id: str
    interaction_type: InteractionType
    timestamp: datetime = Field(default_factory=datetime.now)
    # Metadata for recommendation logic
    channel_title: Optional[str] = None
    video_title: Optional[str] = None

class UserProfile(BaseModel):
    user_id: str = "default_user"
    interactions: List[UserInteraction] = []
    preferred_channels: List[str] = [] # e.g. ["TED", "FireShip"]

    def get_liked_video_ids(self) -> List[str]:
        return [i.video_id for i in self.interactions if i.interaction_type == InteractionType.LIKE]

    def get_skipped_video_ids(self) -> List[str]:
        return [i.video_id for i in self.interactions if i.interaction_type == InteractionType.SKIP]

    def calculate_preferences(self):
        # A crude way to update preferred channels based on Likes
        counts = {}
        for i in self.interactions:
            if i.interaction_type == InteractionType.LIKE and i.channel_title:
                counts[i.channel_title] = counts.get(i.channel_title, 0) + 1
        
        # Sort and take top 5
        sorted_channels = sorted(counts.items(), key=lambda x: x[1], reverse=True)
        self.preferred_channels = [c[0] for c in sorted_channels[:5]] 
