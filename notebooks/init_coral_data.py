import pandas as pd
import os

def init_data():
    url = "https://www.ncei.noaa.gov/erddap/tabledap/deep_sea_corals.csv?ScientificName%2COcean%2Clatitude%2Clongitude%2CDepthInMeters%2CObservationYear%2CIndividualCount%2CCategoricalAbundance%2CDensity%2CCondition%2CTemperature%2CSalinity%2CpH%2CpHscale&Ocean=%22North%20Pacific%22&latitude%3E=33.5&latitude%3C=34.5&longitude%3E=-120.5&longitude%3C=-119.0&ObservationYear%3E=2014"
    
    print(f"Fetching data from {url}...")
    df = pd.read_csv(url, skiprows=[1])
    
    # Define paths relative to the script's location
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(script_dir, '..', 'data')
    
    os.makedirs(data_dir, exist_ok=True)
    output_path = os.path.join(data_dir, 'coral.csv')
    
    df.to_csv(output_path, index=False)
    print(f"Data saved to {output_path}")

if __name__ == "__main__":
    init_data()
