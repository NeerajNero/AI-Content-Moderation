function severityToScore(severity) {
    switch (severity) {
      case "critical": return 95;
      case "high": return 80;
      case "medium": return 60;
      case "low":
      default: return 10;
    }
  }
  
  function generateFinalExplanation(decision) {
    if (decision === "approved") {
      return "Content passed moderation checks and is considered safe.";
    }
    if (decision === "under_review") {
      return "Content contains borderline elements and requires manual review.";
    }
    return "Content violates policy and has been rejected.";
  }
  
  function evaluateDecision({ text, image }) {
  
    const textScore = text ? severityToScore(text.severity) : 0;
    const imageScore = image ? severityToScore(image.severity) : 0;
  
    const combinedRisk = Math.max(textScore, imageScore);
  
    let decision = "approved";
  
    if (combinedRisk >= 90) decision = "rejected";
    else if (combinedRisk >= 75) decision = "rejected";
    else if (combinedRisk >= 50) decision = "under_review";
  
    return {
      textRisk: textScore,
      imageRisk: imageScore,
      combinedRisk,
      decision,
      finalExplanation: generateFinalExplanation(decision)
    };
  }
  
  module.exports = { evaluateDecision };
  