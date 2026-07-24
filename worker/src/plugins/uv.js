/**
 * uv.js
 * UV Index forecast plugin using Open-Meteo's free keyless API.
 */

export const definition = {
  name: "get_uv_forecast",
  description: "Get the hourly UV index forecast for the current day for a specific latitude and longitude coordinates. Use this tool if the user asks about the UV index, sun protection, skin safety, or wants a UV forecast graph.",
  parameters: {
    type: "OBJECT",
    properties: {
      latitude: {
        type: "NUMBER",
        description: "The latitude coordinates of the location."
      },
      longitude: {
        type: "NUMBER",
        description: "The longitude coordinates of the location."
      }
    },
    required: ["latitude", "longitude"]
  }
};

export async function execute({ latitude, longitude }) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=uv_index,is_day&timezone=auto`;
    const res = await fetch(url);

    if (!res.ok) {
      return { error: `Failed to fetch UV forecast. Status: ${res.status}` };
    }

    const data = await res.json();
    const hourly = data.hourly;
    if (!hourly) {
      return { error: "No hourly forecast data returned" };
    }

    const times = hourly.time || [];
    const uvValues = hourly.uv_index || [];
    const isDayValues = hourly.is_day || [];

    const daytimeForecast = [];
    // Open-Meteo returns 24 hours of data starting from midnight today (index 0 to 23)
    for (let i = 0; i < 24; i++) {
      if (i >= times.length) break;
      
      const isDay = isDayValues[i];
      if (isDay === 1) { // Only take daytime hours
        const hour = times[i].split("T")[1] || ""; // e.g. "06:00"
        daytimeForecast.push({
          time: hour,
          uv: uvValues[i]
        });
      }
    }

    return {
      latitude,
      longitude,
      timezone: data.timezone,
      hourlyForecast: daytimeForecast
    };
  } catch (err) {
    return { error: `Failed to execute UV forecast: ${err.message}` };
  }
}
