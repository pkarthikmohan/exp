import requests
import json

def test():
    print("Testing Recommendation Engine...")
    try:
        # 1. Health Check
        r = requests.get("http://127.0.0.1:8000/")
        print("Health Check:", r.json())
        
        # 2. Test Recommendation
        payload = {
            "user_id": "test_user",
            "candidate_videos": [
                {"id": "v1", "title": "React Tutorial", "channel_title": "FireShip"},
                {"id": "v2", "title": "Boring Video", "channel_title": "BoringChannel"},
                {"id": "v3", "title": "Python FastApi", "channel_title": "TechWithTim"}
            ],
            "user_interactions": [
                # User Likes FireShip
                {"video_id": "v99", "interaction_type": "like", "channel_title": "FireShip"}
            ]
        }
        
        print("\nSending Recommendation Request...")
        r = requests.post("http://127.0.0.1:8000/recommend", json=payload)
        if r.status_code == 200:
            results = r.json()
            print("Successfully Ranked Videos:")
            for i, v in enumerate(results):
                print(f"{i+1}. {v['title']} (Channel: {v['channel_title']})")
        else:
            print("Error:", r.text)

    except Exception as e:
        print("Connection Failed:", e)

if __name__ == "__main__":
    test()
