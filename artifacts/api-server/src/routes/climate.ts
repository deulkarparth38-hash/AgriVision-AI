import { Router, type IRouter } from "express";
import { GetWeatherForecastQueryParams, GetWeatherForecastResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/require-auth";

const router: IRouter = Router();

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map((item) => Number(item ?? 0)) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

router.get("/weather/forecast", requireAuth, async (req, res): Promise<void> => {
  const params = GetWeatherForecastQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "Enter a valid latitude and longitude." });
    return;
  }
  const query = new URLSearchParams({
    latitude: String(params.data.latitude),
    longitude: String(params.data.longitude),
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
    forecast_days: "7",
    timezone: "auto",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query.toString()}`, {
    signal: AbortSignal.timeout(9000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    req.log.warn({ status: response.status }, "Weather provider returned an error");
    res.status(502).json({ error: "The weather forecast is temporarily unavailable." });
    return;
  }
  const result = (await response.json()) as {
    daily?: Record<string, unknown>;
  };
  const daily = result.daily ?? {};
  const dates = stringArray(daily.time);
  const max = numberArray(daily.temperature_2m_max);
  const min = numberArray(daily.temperature_2m_min);
  const rain = numberArray(daily.precipitation_sum);
  const rainProbability = numberArray(daily.precipitation_probability_max);
  const wind = numberArray(daily.wind_speed_10m_max);
  if (!dates.length || !max.length || !min.length) {
    res.status(502).json({ error: "The weather provider returned an incomplete forecast." });
    return;
  }
  const days = dates.map((date, index) => ({
    date,
    minC: min[index] ?? 0,
    maxC: max[index] ?? 0,
    precipitationMm: rain[index] ?? 0,
    precipitationProbability: Math.round(rainProbability[index] ?? 0),
    windKph: wind[index] ?? 0,
  }));
  const risks: { type: "heat" | "frost" | "drought" | "heavy_rain" | "wind"; level: "low" | "moderate" | "high"; detail: string }[] = [];
  const hottest = Math.max(...days.map((day) => day.maxC));
  const coldest = Math.min(...days.map((day) => day.minC));
  const rainTotal = days.reduce((total, day) => total + day.precipitationMm, 0);
  const strongestWind = Math.max(...days.map((day) => day.windKph));
  if (hottest >= 38) {
    risks.push({ type: "heat", level: "high", detail: `Forecast highs reach ${hottest.toFixed(0)}°C. Check crop water stress and avoid heat-sensitive field work.` });
  } else if (hottest >= 34) {
    risks.push({ type: "heat", level: "moderate", detail: `Forecast highs reach ${hottest.toFixed(0)}°C. Monitor for heat stress, especially in young crops.` });
  }
  if (coldest <= 1) {
    risks.push({ type: "frost", level: "high", detail: `Forecast lows reach ${coldest.toFixed(0)}°C. Protect frost-sensitive plants where feasible.` });
  } else if (coldest <= 4) {
    risks.push({ type: "frost", level: "moderate", detail: `Forecast lows reach ${coldest.toFixed(0)}°C. Check local frost-sensitive crop guidance.` });
  }
  if (rainTotal >= 100) {
    risks.push({ type: "heavy_rain", level: "high", detail: `About ${rainTotal.toFixed(0)} mm of rain is forecast over seven days. Check drainage and field access.` });
  } else if (rainTotal >= 50) {
    risks.push({ type: "heavy_rain", level: "moderate", detail: `About ${rainTotal.toFixed(0)} mm of rain is forecast over seven days. Watch for waterlogging.` });
  }
  if (rainTotal < 5) {
    risks.push({ type: "drought", level: "moderate", detail: "Less than 5 mm of rain is forecast this week. Confirm soil moisture and irrigation availability." });
  }
  if (strongestWind >= 55) {
    risks.push({ type: "wind", level: "high", detail: `Forecast wind gust conditions may affect spraying and tall crops; peak wind is ${strongestWind.toFixed(0)} km/h.` });
  } else if (strongestWind >= 40) {
    risks.push({ type: "wind", level: "moderate", detail: `Wind may affect spraying or lodging risk; peak wind is ${strongestWind.toFixed(0)} km/h.` });
  }
  if (!risks.length) {
    risks.push({ type: "drought", level: "low", detail: "No elevated weather trigger was detected by this simple seven-day screen. Keep monitoring local field conditions." });
  }
  res.json(
    GetWeatherForecastResponse.parse({
      locationLabel: `${params.data.latitude.toFixed(3)}, ${params.data.longitude.toFixed(3)}`,
      updatedAt: new Date().toISOString(),
      source: "Open-Meteo",
      days,
      risks,
    }),
  );
});

export default router;