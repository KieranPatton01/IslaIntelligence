/**
 * weather.js
 * Weather plugin using the free API-key-less wttr.in service.
 */

export const definition = {
  name: "get_weather",
  description: "Get the current weather (temperature and conditions) for a specific city or region. Use this tool if the user asks about the weather, temperature, or climate in a place.",
  parameters: {
    type: "OBJECT",
    properties: {
      location: {
        type: "STRING",
        description: "The city name and optional country or region, e.g. London, UK or Paris, France."
      }
    },
    required: ["location"]
  }
};

export async function execute({ location }) {
  try {
    const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "curl/7.81.0" } // wttr.in sometimes behaves differently without a standard agent
    });

    if (!res.ok) {
      return { error: `Failed to fetch weather. Status: ${res.status}` };
    }

    const data = await res.json();
    const current = data.current_condition?.[0];
    if (!current) {
      return { error: `Could not retrieve current conditions for ${location}` };
    }

    return {
      location,
      temperatureC: `${current.temp_C}°C`,
      temperatureF: `${current.temp_F}°F`,
      condition: current.weatherDesc?.[0]?.value || "Unknown",
      humidity: `${current.humidity}%`,
      windSpeed: `${current.windspeedKmph} km/h`
    };
  } catch (err) {
    return { error: `Failed to execute weather check: ${err.message}` };
  }
}
