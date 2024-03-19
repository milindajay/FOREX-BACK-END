const { query } = require('../database'); // Ensure the path to your database module is correct

// Recursive function to calculate referral points
const calculateReferralPoints = (sideAPoints = 0, sideBPoints = 0) => {
	// Calculate remaining points to reach the next bonus level
	const minSide = Math.min(sideAPoints, sideBPoints);
	const sideARemaining = sideAPoints > sideBPoints ? 0 : minSide + 1 - sideAPoints;
	const sideBRemaining = sideBPoints > sideAPoints ? 0 : minSide + 1 - sideBPoints;

	return { sideAPoints, sideBPoints, sideARemaining, sideBRemaining };
};

const buildTree = async (currentId, level = 1) => {
	const sideAChildren = [];
	const sideBChildren = [];

	if (level > 2)
		return {
			sideAChildren,
			sideBChildren,
			level,
			levelSkipped: true,
		};

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

	for (const referral of referrals) {
		// Calculate referral points for this node
		// const points = await calculateReferralPoints(referral.member_id);

		// Recursive call to process each child node
		// const subTree = await buildTree(referral.member_id);
		const [points, subTree] = await Promise.all([
			calculateReferralPoints(referral.member_id),
			buildTree(referral.member_id, level + 1),
		]);

		const child = {
			member_id: referral.member_id,
			first_name: referral.first_name,
			last_name: referral.last_name,
			referral_type: referral.referral_type,
			introducer: referral.introducer,
			sideAPoints: points.sideA,
			sideBPoints: points.sideB,
			sideARemaining: points.remainingA,
			sideBRemaining: points.remainingB,
			...subTree,
		};
		// children.push(child);
		if (child.referral_type === 'A') sideAChildren.push(child);
		else sideBChildren.push(child);
	}

	return {
		sideAChildren,
		sideBChildren,
		level,
		levelSkipped: false,
	};
};

function unflattenArray(arr) {
	const root = [];
	let currentLevel = root;

	for (const obj of arr) {
		const newObj = { ...obj }; // Copy the entire object
		newObj.children = [];
		currentLevel.push(newObj);
		currentLevel = newObj.children;
	}

	return root;
}

const buildReferralTree = async (
	referral_side_A_member_id,
	referral_side_B_member_id,
	maxLevel = Infinity,
	level = 1
) => {
	let sideAReferral = null;
	let sideBReferral = null;
	let skipped = false;

	if (level > maxLevel) skipped = true;

	if (!skipped) {
		const referralMemberIds = [referral_side_A_member_id, referral_side_B_member_id].filter((id) => id);
		if (referralMemberIds.length > 0) {
			const referralsQuery = `
            SELECT 
                member_id, 
                first_name, 
                last_name, 
                referral_type, 
                introducer,
				sp_A,
				sp_B,
				referral_side_A_member_id,
				referral_side_B_member_id 
            FROM 
                fx_users 
            WHERE 
                member_id IN (?) `;
			const referrals = await query(referralsQuery, [referralMemberIds]);

			if (referrals.length > 0) {
				for (const referral of referrals) {
					const sideAReferralMemberId = referral['referral_side_A_member_id'];
					const sideBReferralMemberId = referral['referral_side_B_member_id'];

					const tree = await buildReferralTree(sideAReferralMemberId, sideBReferralMemberId, maxLevel, level + 1);
					const referralPoints = calculateReferralPoints(referral.sp_A || 0, referral.sp_B || 0);

					const modifiedReferral = { ...referral, ...tree, ...referralPoints, level };

					if (referral.referral_type === 'A') sideAReferral = modifiedReferral;
					else sideBReferral = modifiedReferral;
				}
			}
		}
	}
	return { sideAReferral, sideBReferral, skipped };
};

const getReferralTree = async (memberId) => {
	// Fetch and include the root member's details
	const rootMembers = await query(
		`
        SELECT 
            member_id, 
            first_name, 
            last_name, 
            referral_type, 
            introducer,
			sp_A,
			sp_B,
			referral_side_A_member_id,
			referral_side_B_member_id
        FROM 
            fx_users 
        WHERE 
            member_id = ?`,
		[memberId]
	);

	if (rootMembers.length === 0) {
		throw new Error('Root member not found.');
	}

	const rootMember = rootMembers[0];
	// Calculate referral points for the root member
	// const rootPoints = await calculateReferralPoints(rootMember.member_id);

	// Start building the tree from the root member
	// const tree = await buildTree(memberId);

	const referral_side_A_member_id = rootMember['referral_side_A_member_id'];
	const referral_side_B_member_id = rootMember['referral_side_B_member_id'];
	// const sideAReferral = await getReferral(sideAReferralMemberId, 'A');
	// const sideBReferral = await getReferral(sideBReferralMemberId, 'B');
	const referralPoints = calculateReferralPoints(rootMember.sp_A || 0, rootMember.sp_B || 0);
	const tree = await buildReferralTree(referral_side_A_member_id, referral_side_B_member_id, 3, 2);

	return [
		{
			member_id: rootMember.member_id,
			first_name: rootMember.first_name,
			last_name: rootMember.last_name,
			referral_type: rootMember.referral_type,
			introducer: rootMember.introducer,
			referral_side_A_member_id,
			referral_side_B_member_id,
			...referralPoints,
			...tree,
			level: 1,
		},
	];
};

module.exports = {
	getReferralTree,
};
