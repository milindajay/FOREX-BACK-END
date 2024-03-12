const { query } = require('../database'); // Make sure this path is correct.

const getReferralTree = async (memberId) => {
    const buildTree = async (currentId) => {
        const referralsQuery = `
            SELECT 
                member_id, 
                first_name, 
                last_name, 
                referral_type, 
                introducer 
            FROM 
                fx_users 
            WHERE 
                introducer = ?`;
        const referrals = await query(referralsQuery, [currentId]);

        let children = [];

        for (const referral of referrals) {
            const subTree = await buildTree(referral.member_id); // Recursive call
            children.push({
                member_id: referral.member_id,
                first_name: referral.first_name,
                last_name: referral.last_name,
                referral_type: referral.referral_type,
                introducer: referral.introducer, // Add introducer member ID
                children: subTree
            });
        }

        return children;
    };

    // Fetch and include the root member's introducer
    const rootMemberQuery = `
        SELECT 
            member_id, 
            first_name, 
            last_name, 
            referral_type, 
            introducer 
        FROM 
            fx_users 
        WHERE 
            member_id = ?`;
    const rootMembers = await query(rootMemberQuery, [memberId]);
    if (rootMembers.length === 0) {
        throw new Error('Root member not found.');
    }
    const rootMember = rootMembers[0];

    // Start building the tree from the given member ID
    const tree = await buildTree(memberId);

    return [{
        member_id: rootMember.member_id,
        first_name: rootMember.first_name,
        last_name: rootMember.last_name,
        referral_type: rootMember.referral_type,
        introducer: rootMember.introducer, // This is the root member's introducer
        children: tree
    }];
};

module.exports = {
    getReferralTree,
};