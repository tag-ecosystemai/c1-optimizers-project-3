"""
Simulated weather and news data generator for testing
Provides realistic present/future data that resembles real-world patterns
"""

import random
from datetime import datetime, timedelta
from typing import List, Dict, Any
class SimulatedDataGenerator:
    def __init__(self):
        # Realistic weather patterns by market (base temp, variability, rain chance)
        self.weather_patterns = {
            'Europe': {'base_temp': 15, 'variability': 10, 'rain_chance': 0.3},
            'USCA': {'base_temp': 20, 'variability': 15, 'rain_chance': 0.25},
            'Pacific Asia': {'base_temp': 25, 'variability': 20, 'rain_chance': 0.4},
            'LATAM': {'base_temp': 18, 'variability': 12, 'rain_chance': 0.35},
            'Africa': {'base_temp': 22, 'variability': 18, 'rain_chance': 0.2}
        }
        
        # Realistic news templates by category
        self.news_templates = {
            'supply_chain': [
                "Transportation strike affects {market} region",
                "Port operations suspended due to weather",
                "New environmental regulation impacts shipments",
                "Union negotiations threaten logistics operations",
                "Container shortage disrupts supply chain"
            ],
            'weather': [
                "Extreme weather warning issued for {market}",
                "Heat wave advisory extended across {market}",
                "Severe storms expected in {market} this week",
                "Flash flood warnings issued for {market}",
                "Winter storm warning active in {market}"
            ],
            'demand': [
                "Unexpected demand surge in {market} market",
                "Consumer confidence rises in {market}",
                "Seasonal demand peak approaching in {market}",
                "New product launch driving demand in {market}",
                "Economic indicators positive for {market}"
            ],
            'disruption': [
                "Major supplier factory shutdown in {market} region",
                "Infrastructure failure impacts logistics",
                "Regulatory inspection delays operations",
                "Technology system outage affects tracking",
                "Labor strike at distribution center"
            ]
        }
    
    def generate_weather(self, market: str, start_date: str, end_date: str, as_of_date: str) -> List[Dict]:
        """Generate realistic weather patterns for present/future dates"""
        pattern = self.weather_patterns.get(market, self.weather_patterns['Europe'])
        
        days = []
        current_date = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d')
        
        while current_date <= end_dt:
            day_num = (current_date - datetime.strptime(start_date, '%Y-%m-%d')).days
            
            # Generate realistic weather with some patterns
            base_temp = pattern['base_temp'] + random.uniform(-pattern['variability'], pattern['variability'])
            precipitation = random.random() * 20 if random.random() < pattern['rain_chance'] else 0
            
            # Add realistic patterns
            if day_num % 7 == 0:  # Weekend weather often different
                base_temp += 2 if random.random() < 0.5 else -2
                precipitation += random.uniform(0, 5)
            
            # Temperature trends
            days_diff = (datetime.strptime(as_of_date, '%Y-%m-%d') - datetime.strptime(start_date, '%Y-%m-%d')).days
            if days_diff < 0:  # Looking forward from as_of_date
                seasonal_factor = 1 + 0.1 * abs(days_diff) / 30
                base_temp *= seasonal_factor
            
            days.append({
                'date': current_date.strftime('%Y-%m-%d'),
                'temperature_max': round(base_temp, 1),
                'precipitation': round(precipitation, 1),
                'conditions': self._get_weather_conditions(base_temp, precipitation),
                'severity': self._get_weather_severity(base_temp, precipitation),
                'market': market
            })
            
            current_date += timedelta(days=1)
        
        return days
    
    def generate_news(self, market: str, start_date: str, end_date: str, as_of_date: str) -> List[Dict]:
        """Generate realistic news patterns for present/future dates"""
        news_items = []
        
        # Generate 1-4 news items
        num_items = random.randint(1, 4)
        categories = random.sample(list(self.news_templates.keys()), num_items)
        
        for category in categories:
            template = random.choice(self.news_templates[category])
            headline = template.format(market=market)
            
            # Add realistic context
            impact = random.choice(['minor', 'moderate', 'major'])
            duration = random.choice(['temporary', 'short-term', 'ongoing'])
            
            news_item = {
                'type': category,
                'source': 'Simulated Market Intelligence',
                'headline': headline,
                'date': start_date,
                'impact': impact,
                'duration': duration,
                'relevance': round(random.uniform(0.6, 0.95), 2),
                'affected_sectors': self._get_affected_sectors(category, market),
                'estimated_cost_impact': self._estimate_cost_impact(category, impact),
                'market': market
            }
            
            news_items.append(news_item)
        
        return news_items
    
    def _get_weather_conditions(self, temp: float, precip: float) -> str:
        """Generate realistic weather condition descriptions"""
        if precip > 15:
            return 'Stormy'
        elif precip > 5:
            return 'Rainy'
        elif temp > 30:
            return 'Hot'
        elif temp > 25:
            return 'Warm'
        elif temp > 15:
            return 'Pleasant'
        elif temp > 10:
            return 'Cool'
        else:
            return 'Cold'
    
    def _get_weather_severity(self, temp: float, precip: float) -> str:
        """Generate weather severity levels"""
        if precip > 20 or temp > 35 or temp < 5:
            return 'Severe'
        elif precip > 10 or temp > 30 or temp < 10:
            return 'Moderate'
        else:
            return 'Mild'
    
    def _get_affected_sectors(self, category: str, market: str) -> List[str]:
        """Determine which sectors are affected by news"""
        sectors_map = {
            'supply_chain': ['logistics', 'manufacturing', 'distribution'],
            'weather': ['transportation', 'agriculture', 'energy'],
            'demand': ['retail', 'e-commerce', 'inventory'],
            'disruption': ['operations', 'customer_service', 'finance']
        }
        return sectors_map.get(category, ['general'])
    
    def _estimate_cost_impact(self, category: str, impact: str) -> Dict:
        """Estimate realistic cost impacts"""
        base_costs = {
            'supply_chain': {'minor': 5000, 'moderate': 25000, 'major': 100000},
            'weather': {'minor': 2000, 'moderate': 10000, 'major': 50000},
            'demand': {'positive': 15000, 'neutral': 0, 'negative': -20000},
            'disruption': {'minor': 8000, 'moderate': 40000, 'major': 150000}
        }
        
        return {
            'amount': base_costs.get(category, {}).get(impact, 0),
            'currency': 'USD',
            'timeframe': 'weekly'
        }
# Global instance for easy import
simulated_data = SimulatedDataGenerator()