import { requireAdmin } from '../middleware/authMiddleware.js';
router.delete('/some-admin-action/:id', requireAdmin, async (req, res) => {
    // Protected admin action
});