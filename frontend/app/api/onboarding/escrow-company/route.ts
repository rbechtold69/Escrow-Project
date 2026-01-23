/**
 * ============================================================================
 * ESCROW COMPANY ONBOARDING API
 * ============================================================================
 * 
 * POST /api/onboarding/escrow-company
 * 
 * This endpoint handles the full onboarding flow for a new Escrow Company:
 * 
 * 1. Create a Business Customer in Bridge.xyz (with EIN/Tax ID)
 * 2. Add the Escrow Officer as an Associated Person (Control Person)
 * 3. Generate KYC Links for secure identity verification
 * 4. Save the Bridge Customer ID to our database (NOT the EIN)
 * 5. Return the KYC/TOS links for the user to complete verification
 * 
 * SECURITY:
 * - EIN is sent to Bridge but NEVER stored in our database
 * - SSN collection is handled by Bridge's hosted KYC flow
 * - We only store tokenized references (Bridge IDs)
 * 
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getBridgeClient } from '@/lib/bridge-client';
import prisma from '@/lib/prisma';

// ============================================================================
// REQUEST VALIDATION
// ============================================================================

interface OnboardingRequest {
  // Company Information
  companyName: string;
  taxIdentificationNumber: string;  // EIN - sent to Bridge, NOT stored
  businessEmail: string;
  website?: string;
  
  // Company Address
  streetLine1: string;
  streetLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  
  // Officer Information
  officerFirstName: string;
  officerLastName: string;
  officerTitle: string;
  officerEmail?: string;
}

function validateRequest(body: unknown): { valid: true; data: OnboardingRequest } | { valid: false; error: string } {
  const data = body as Record<string, unknown>;
  
  // Required fields
  const requiredFields = [
    'companyName',
    'taxIdentificationNumber',
    'businessEmail',
    'streetLine1',
    'city',
    'state',
    'postalCode',
    'officerFirstName',
    'officerLastName',
    'officerTitle',
  ];
  
  for (const field of requiredFields) {
    if (!data[field] || typeof data[field] !== 'string' || (data[field] as string).trim() === '') {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.businessEmail as string)) {
    return { valid: false, error: 'Invalid business email format' };
  }
  
  // Validate EIN format (XX-XXXXXXX)
  const einRegex = /^\d{2}-?\d{7}$/;
  if (!einRegex.test(data.taxIdentificationNumber as string)) {
    return { valid: false, error: 'Invalid EIN format. Expected: XX-XXXXXXX' };
  }
  
  // Validate state (2 letters)
  if ((data.state as string).length !== 2) {
    return { valid: false, error: 'State must be a 2-letter code (e.g., CA, NY)' };
  }
  
  return {
    valid: true,
    data: {
      companyName: (data.companyName as string).trim(),
      taxIdentificationNumber: (data.taxIdentificationNumber as string).replace(/-/g, ''), // Normalize
      businessEmail: (data.businessEmail as string).trim().toLowerCase(),
      website: data.website ? (data.website as string).trim() : undefined,
      streetLine1: (data.streetLine1 as string).trim(),
      streetLine2: data.streetLine2 ? (data.streetLine2 as string).trim() : undefined,
      city: (data.city as string).trim(),
      state: (data.state as string).trim().toUpperCase(),
      postalCode: (data.postalCode as string).trim(),
      country: data.country ? (data.country as string).trim() : 'USA',
      officerFirstName: (data.officerFirstName as string).trim(),
      officerLastName: (data.officerLastName as string).trim(),
      officerTitle: (data.officerTitle as string).trim(),
      officerEmail: data.officerEmail ? (data.officerEmail as string).trim().toLowerCase() : undefined,
    },
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  console.log('[Onboarding] POST /api/onboarding/escrow-company');
  
  try {
    // Parse request body
    const body = await request.json();
    
    // Validate input
    const validation = validateRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }
    
    const data = validation.data;
    
    // Generate unique idempotency keys
    const customerIdempotencyKey = `customer-${uuidv4()}`;
    const personIdempotencyKey = `person-${uuidv4()}`;
    const kycIdempotencyKey = `kyc-${uuidv4()}`;
    
    let bridgeCustomer;
    let bridgeAssociatedPerson;
    let bridgeKycLink;
    let isDemo = false;
    
    try {
      // ══════════════════════════════════════════════════════════════════════
      // STEP 1: Create Business Customer in Bridge.xyz
      // ══════════════════════════════════════════════════════════════════════
      console.log('[Onboarding] Step 1: Creating Business Customer in Bridge...');
      
      const bridge = getBridgeClient();
      
      bridgeCustomer = await bridge.createBusinessCustomer(
        customerIdempotencyKey,
        {
          companyName: data.companyName,
          email: data.businessEmail,
          einTaxId: data.taxIdentificationNumber, // Sent to Bridge, NOT stored by us
          website: data.website,
          address: {
            streetLine1: data.streetLine1,
            streetLine2: data.streetLine2,
            city: data.city,
            state: data.state,
            postalCode: data.postalCode,
            country: data.country || 'USA',
          },
        }
      );
      
      console.log('[Onboarding] Business Customer created:', bridgeCustomer.id);
      
      // ══════════════════════════════════════════════════════════════════════
      // STEP 2: Add Escrow Officer as Associated Person
      // ══════════════════════════════════════════════════════════════════════
      console.log('[Onboarding] Step 2: Adding Associated Person (Officer)...');
      
      bridgeAssociatedPerson = await bridge.addAssociatedPerson(
        bridgeCustomer.id,
        personIdempotencyKey,
        {
          firstName: data.officerFirstName,
          lastName: data.officerLastName,
          email: data.officerEmail || data.businessEmail,
          title: data.officerTitle,
          isControlPerson: true,
        }
      );
      
      console.log('[Onboarding] Associated Person added:', bridgeAssociatedPerson.id);
      
      // ══════════════════════════════════════════════════════════════════════
      // STEP 3: Generate KYC Links for Identity Verification
      // ══════════════════════════════════════════════════════════════════════
      console.log('[Onboarding] Step 3: Generating KYC Links...');
      
      const officerFullName = `${data.officerFirstName} ${data.officerLastName}`;
      
      bridgeKycLink = await bridge.createKycLink(
        kycIdempotencyKey,
        {
          fullName: officerFullName,
          email: data.officerEmail || data.businessEmail,
          type: 'business',
          customerId: bridgeCustomer.id,
        }
      );
      
      console.log('[Onboarding] KYC Link generated:', bridgeKycLink.id);
      
    } catch (bridgeError) {
      // ══════════════════════════════════════════════════════════════════════
      // DEMO MODE FALLBACK
      // ══════════════════════════════════════════════════════════════════════
      // If Bridge API is not configured or fails, use demo data
      console.warn('[Onboarding] Bridge API error, using demo mode:', bridgeError);
      isDemo = true;
      
      const demoId = `demo_${uuidv4().substring(0, 8)}`;
      
      bridgeCustomer = {
        id: `cust_${demoId}`,
        type: 'business' as const,
        business_name: data.companyName,
        email: data.businessEmail,
        created_at: new Date().toISOString(),
      };
      
      bridgeAssociatedPerson = {
        id: `person_${demoId}`,
        customer_id: bridgeCustomer.id,
        first_name: data.officerFirstName,
        last_name: data.officerLastName,
        email: data.officerEmail,
        title: data.officerTitle,
        is_control_person: true,
        created_at: new Date().toISOString(),
      };
      
      bridgeKycLink = {
        id: `kyc_${demoId}`,
        full_name: `${data.officerFirstName} ${data.officerLastName}`,
        email: data.officerEmail || data.businessEmail,
        type: 'business' as const,
        kyc_link: `https://demo.bridge.xyz/verify?id=${demoId}`,
        tos_link: `https://demo.bridge.xyz/tos?id=${demoId}`,
        kyc_status: 'not_started' as const,
        tos_status: 'pending' as const,
        rejection_reasons: [],
        created_at: new Date().toISOString(),
        customer_id: bridgeCustomer.id,
      };
    }
    
    // ══════════════════════════════════════════════════════════════════════════
    // STEP 4: Save to Database (ONLY tokenized references, NOT EIN)
    // ══════════════════════════════════════════════════════════════════════════
    console.log('[Onboarding] Step 4: Saving to database...');
    
    const escrowCompany = await prisma.escrowCompany.create({
      data: {
        bridgeCustomerId: bridgeCustomer.id,
        companyName: data.companyName,
        businessEmail: data.businessEmail,
        website: data.website,
        streetLine1: data.streetLine1,
        streetLine2: data.streetLine2,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        country: data.country || 'USA',
        kybStatus: 'PENDING',
        officers: {
          create: {
            bridgePersonId: bridgeAssociatedPerson.id,
            firstName: data.officerFirstName,
            lastName: data.officerLastName,
            email: data.officerEmail || data.businessEmail,
            title: data.officerTitle,
            isControlPerson: true,
            kycStatus: 'PENDING',
            kycLink: bridgeKycLink.kyc_link,
            tosLink: bridgeKycLink.tos_link,
          },
        },
      },
      include: {
        officers: true,
      },
    });
    
    console.log('[Onboarding] Company saved:', escrowCompany.id);
    
    // ══════════════════════════════════════════════════════════════════════════
    // STEP 5: Return KYC Links to Frontend
    // ══════════════════════════════════════════════════════════════════════════
    
    return NextResponse.json({
      success: true,
      isDemo,
      companyId: escrowCompany.id,
      bridgeCustomerId: bridgeCustomer.id,
      officer: {
        id: escrowCompany.officers[0].id,
        firstName: data.officerFirstName,
        lastName: data.officerLastName,
      },
      // These are the URLs the user should be redirected to
      kycLink: bridgeKycLink.kyc_link,
      tosLink: bridgeKycLink.tos_link,
      kycStatus: bridgeKycLink.kyc_status,
      tosStatus: bridgeKycLink.tos_status,
      message: isDemo 
        ? 'Demo mode: Company profile created. In production, redirect to the KYC link.'
        : 'Company profile created! Please complete your secure ID verification.',
    });
    
  } catch (error) {
    console.error('[Onboarding] Error:', error);
    
    // Handle Prisma errors
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'This company has already been registered.' },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to onboard company' },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET - Check onboarding status
// ============================================================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');
  const bridgeCustomerId = searchParams.get('bridgeCustomerId');
  
  if (!companyId && !bridgeCustomerId) {
    return NextResponse.json(
      { error: 'Missing companyId or bridgeCustomerId parameter' },
      { status: 400 }
    );
  }
  
  try {
    const company = await prisma.escrowCompany.findFirst({
      where: companyId 
        ? { id: companyId }
        : { bridgeCustomerId: bridgeCustomerId! },
      include: {
        officers: true,
      },
    });
    
    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      id: company.id,
      companyName: company.companyName,
      bridgeCustomerId: company.bridgeCustomerId,
      kybStatus: company.kybStatus,
      officers: company.officers.map(officer => ({
        id: officer.id,
        name: `${officer.firstName} ${officer.lastName}`,
        title: officer.title,
        kycStatus: officer.kycStatus,
        kycLink: officer.kycLink,
        tosLink: officer.tosLink,
      })),
    });
    
  } catch (error) {
    console.error('[Onboarding] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch company status' },
      { status: 500 }
    );
  }
}
