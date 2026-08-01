# Correctif des réglages de mise à jour

Le serveur complète désormais les champs absents d'une requête `PUT /api/admin/update-settings` avec les valeurs déjà enregistrées. Les clients qui omettent les notes ou les liens facultatifs ne provoquent donc plus l'erreur `expected string, received undefined`.
