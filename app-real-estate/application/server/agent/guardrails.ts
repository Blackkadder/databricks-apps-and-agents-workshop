const PROTECTED_OR_STEERING = [
  /\b(race|racial|ethnic(?:ity)?|religion|christian|jewish|muslim|national origin)\b/i,
  /\b(famil(?:y|ies)|children|kids|single people|marital status|pregnan\w*)\b/i,
  /\b(disab\w*|wheelchair|medical condition|sex|gender|sexual orientation)\b/i,
  /\b(safe(?:st)?|crime|good schools?|bad schools?|type of people|demographic)\b/i,
];

export const FAIR_HOUSING_RESPONSE =
  'I can’t recommend or rank housing based on protected characteristics, demographics, school quality, crime, or who lives in an area. I can help with objective listing attributes such as price, size, amenities, and transit score.';

export function isSteeringRequest(message: string): boolean {
  return PROTECTED_OR_STEERING.some((pattern) => pattern.test(message));
}
