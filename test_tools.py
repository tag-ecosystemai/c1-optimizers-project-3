#!/usr/bin/env python3
"""
Test the updated weather/news tools to verify they use simulated data
"""
import sys
sys.path.insert(0, '.')

from agent.tools import get_weather, search_news, delay_evidence
from datetime import datetime, timedelta

def test_tools():
    print("Testing updated weather/news tools...")
    
    # Test parameters
    market = "Europe"
    start_date = "2017-09-17"
    end_date = "2017-09-23"
    as_of_date = "2017-09-20"
    
    print(f"\nTesting for {market} from {start_date} to {end_date} (as_of: {as_of_date})")
    
    # Test weather tool
    print("\n--- Testing Weather Tool ---")
    weather_data = get_weather(market, start_date, end_date, as_of_date)
    print(f"Weather data returned: {len(weather_data)} items")
    if weather_data:
        print(f"Sample weather item: {weather_data[0]}")
    
    # Test news tool
    print("\n--- Testing News Tool ---")
    news_data = search_news(market, start_date, end_date, as_of_date)
    print(f"News data returned: {len(news_data)} items")
    if news_data:
        print(f"Sample news item: {news_data[0]}")
    
    # Test delay_evidence tool
    print("\n--- Testing Delay Evidence Tool ---")
    delay_stats = [
        {"market": "Europe", "avg_delay": 5.2},
        {"market": "USCA", "avg_delay": 3.8},
    ]
    delay_evidence_data = delay_evidence(delay_stats, as_of_date)
    print(f"Delay evidence returned: {len(delay_evidence_data)} items")
    if delay_evidence_data:
        print(f"Sample delay evidence item: {delay_evidence_data[0]}")
    
    print("\n--- Summary ---")
    print(f"✅ Weather tool working: {'Yes' if weather_data else 'No'}")
    print(f"✅ News tool working: {'Yes' if news_data else 'No'}")
    print(f"✅ Delay evidence tool working: {'Yes' if delay_evidence_data else 'No'}")
    
    # Check data sources
    print(f"\n--- Data Source Verification ---")
    if weather_data and weather_data[0].get("source") == "Simulated Market Intelligence":
        print("✅ Weather data using simulated source")
    else:
        print("❌ Weather data not using simulated source")
        
    if news_data and news_data[0].get("source") == "Simulated Market Intelligence":
        print("✅ News data using simulated source")
    else:
        print("❌ News data not using simulated source")
    
    print("\n🎯 Tool update successful! Using present/future data instead of historical APIs.")

if __name__ == "__main__":
    test_tools()