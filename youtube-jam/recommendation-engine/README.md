# YouTube Jam Recommendation Engine

This is a FastAPI-based microservice for smart video recommendation and re-ranking.

## Setup

1.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

2.  **Environment Variables**:
    - `YOUTUBE_API_KEY`: (Optional) Your Google YouTube Data API Key. If not provided, the service uses mock data.

3.  **Run the Server**:
    ```bash
    uvicorn app.main:app --reload --port 8000
    ```

## API Endpoints

-   `POST /recommend`: Re-ranks a list of candidate videos based on user interaction history.
-   `POST /action`: Records a user interaction (Like/Skip).
