import os
from typing import List
from googleapiclient.discovery import build
from app.models import Video

class YouTubeClient:
    def __init__(self):
        self.api_key = os.environ.get("YOUTUBE_API_KEY")
        self.youtube = None
        if self.api_key:
            self.youtube = build("youtube", "v3", developerKey=self.api_key)

    def search_videos(self, query: str, max_results: int = 10) -> List[Video]:
        if self.youtube:
            return self._search_real(query, max_results)
        return self._search_mock(query, max_results)

    def _search_real(self, query: str, max_results: int) -> List[Video]:
        try:
            request = self.youtube.search().list(
                part="snippet",
                maxResults=max_results,
                q=query,
                type="video"
            )
            response = request.execute()
            videos = []
            for item in response.get("items", []):
                snippet = item["snippet"]
                videos.append(Video(
                    id=item["id"]["videoId"],
                    title=snippet["title"],
                    description=snippet["description"],
                    thumbnail_url=snippet["thumbnails"]["high"]["url"],
                    channel_title=snippet["channelTitle"],
                    published_at=snippet["publishedAt"]
                ))
            return videos
        except Exception as e:
            print(f"Error fetching from YouTube API: {e}")
            return self._search_mock(query, max_results)

    def _search_mock(self, query: str, max_results: int) -> List[Video]:
        # Return some dummy data related to the query if possible, or just generic
        print(f"Using Mock Data for query: {query}")
        mock_videos = [
            Video(
                id="mock_1",
                title=f"Mock Video: {query} Tutorial",
                description="A great tutorial about " + query,
                thumbnail_url="https://via.placeholder.com/320x180.png?text=Mock+1",
                channel_title="MockChannel",
                published_at="2023-01-01T10:00:00Z"
            ),
            Video(
                id="mock_2",
                title=f"Advanced {query} Concepts",
                description="Deep dive into " + query,
                thumbnail_url="https://via.placeholder.com/320x180.png?text=Mock+2",
                channel_title="ExpertCoder",
                published_at="2023-02-15T14:30:00Z"
            ),
             Video(
                id="mock_3",
                title=f"Funny {query} Moments",
                description="Laugh at " + query,
                thumbnail_url="https://via.placeholder.com/320x180.png?text=Mock+3",
                channel_title="ComedyTech",
                published_at="2023-03-10T09:15:00Z"
            ),
        ]
        # Duplicate to meet max_results if needed
        results = []
        while len(results) < max_results:
            results.extend(mock_videos)
        return results[:max_results]
