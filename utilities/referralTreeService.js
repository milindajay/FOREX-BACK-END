const { query } = require('../database'); // Ensure the path to your database module is correct

// Recursive function to calculate referral points
const calculateReferralPoints = async (memberId) => {
	let points = { sideA: 0, sideB: 0, remainingA: 0, remainingB: 0 };

	const referrals = await query(
		`
        SELECT member_id, referral_type FROM fx_users WHERE introducer = ?`,
		[memberId]
	);

	for (let referral of referrals) {
		points[referral.referral_type === 'A' ? 'sideA' : 'sideB'] += 1;

		// Recurse for this referral's own referrals
		let subPoints = await calculateReferralPoints(referral.member_id);
		points.sideA += subPoints.sideA;
		points.sideB += subPoints.sideB;
	}

	// Calculate remaining points to reach the next bonus level
	const minSide = Math.min(points.sideA, points.sideB);
	points.remainingA = points.sideA > points.sideB ? 0 : minSide + 1 - points.sideA;
	points.remainingB = points.sideB > points.sideA ? 0 : minSide + 1 - points.sideB;

	return points;
};

const buildTree = async (currentId, level = 1) => {
	// const sideAChildren = [];
	// const sideBChildren = [];
	const children = [];

	if (level > 2)
		return {
			// sideAChildren, sideBChildren,
			children,
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
		children.push(child);
		// if (child.referral_type === 'A') sideAChildren.push(child);
		// else sideBChildren.push(child);
	}

	return {
		// sideAChildren, sideBChildren,
		children,
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

const buildTreeWithReferralType = async (currentId, referralType) => {
	const children = [];

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
                introducer = ? AND referral_type = ?`;
	const referrals = await query(referralsQuery, [currentId, referralType]);

	for (const referral of referrals) {
		// Calculate referral points for this node
		// const points = await calculateReferralPoints(referral.member_id);

		// Recursive call to process each child node
		// const subTree = await buildTree(referral.member_id);
		// const [points, subTree] = await Promise.all([
		// 	calculateReferralPoints(referral.member_id),
		// 	buildTree(referral.member_id, level + 1),
		// ]);

		const child = {
			member_id: referral.member_id,
			first_name: referral.first_name,
			last_name: referral.last_name,
			referral_type: referral.referral_type,
			introducer: referral.introducer,
		};
		children.push(child);
	}

	return {
		children,
	};
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
            introducer 
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
	const rootPoints = await calculateReferralPoints(rootMember.member_id);

	// Start building the tree from the root member
	// const tree = await buildTree(memberId);
	const sideAChildren = await buildTreeWithReferralType(memberId, 'A');
	const sideBChildren = await buildTreeWithReferralType(memberId, 'B');

	return [
		{
			member_id: rootMember.member_id,
			first_name: rootMember.first_name,
			last_name: rootMember.last_name,
			referral_type: rootMember.referral_type,
			introducer: rootMember.introducer,
			sideAPoints: rootPoints.sideA,
			sideBPoints: rootPoints.sideB,
			sideARemaining: rootPoints.remainingA,
			sideBRemaining: rootPoints.remainingB,
			sideAChildren: unflattenArray(sideAChildren.children),
			sideBChildren: unflattenArray(sideBChildren.children),
		},
	];
};

module.exports = {
	getReferralTree,
};
