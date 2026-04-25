#!/bin/bash
# =============================================================================
# Inferno FHIR Compliance Test Runner
# =============================================================================
# Phase 6: FHIR Validation Plan - docs/fhir-validation-plan.md
#
# This script orchestrates Inferno testing against the Vitora HMIS FHIR API.
#
# Usage:
#   ./docker/inferno/run-tests.sh [options]
#
# Options:
#   --setup         Start the local Inferno infrastructure
#   --ips           Start the local patched IPS workflow in Inferno UI
#   --smoke         Seed local FHIR data and start the Inferno IPS smoke workflow
#   --teardown      Stop and remove all Inferno containers
#   --status        Check status of Inferno services
#   --help          Show this help message
#
# Prerequisites:
#   1. Docker and Docker Compose installed
#   2. Vitora backend running on port 9088
#   3. Test data seeded (patients, encounters, etc.)
# =============================================================================

set -e

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/compose.yml"
ENV_FILE="${SCRIPT_DIR}/.env"
# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
VITORA_URL="${VITORA_FHIR_URL:-http://host.docker.internal:9088/fhir}"

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    cat << 'EOF'
Inferno FHIR Compliance Test Runner

Usage: ./docker/inferno/run-tests.sh [options]

Options:
    --setup         Start the local Inferno infrastructure (PostgreSQL, Redis, Inferno)
    --ips           Start the local patched IPS workflow in Inferno UI
    --smoke         Seed local FHIR data and start the Inferno IPS smoke workflow
  --teardown      Stop and remove all Inferno containers
  --status        Check status of Inferno services
  --help          Show this help message

Test Suite URLs:
    - Inferno UI:      http://localhost:4567

NOTE: The ONC Inferno Program v1.9 has been deprecated (retired June 2022).
            This repo uses the compose-backed Inferno instance plus local startup
            patches for IPS validation.

Example:
    # Start the local Inferno instance
  ./docker/inferno/run-tests.sh --setup

    # Start the local IPS workflow
  ./docker/inferno/run-tests.sh --ips

    # Seed data and prepare the repeatable local IPS smoke flow
    ./docker/inferno/run-tests.sh --smoke
EOF
    exit 0
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available. Please install Docker Compose."
        exit 1
    fi

    # Check if Vitora is running
    if ! curl -s --connect-timeout 5 "http://localhost:9088/api/" > /dev/null 2>&1; then
        log_warning "Vitora backend may not be running on port 9088"
        log_info "Start Vitora with: cd backend && poetry run python manage.py runserver 0.0.0.0:9088"
    else
        log_success "Vitora backend is reachable"
    fi

    # Check FHIR metadata endpoint
    if curl -s --connect-timeout 5 "http://localhost:9088/fhir/metadata" > /dev/null 2>&1; then
        log_success "FHIR CapabilityStatement endpoint is available"
    else
        log_warning "FHIR metadata endpoint not responding (may need to implement /fhir/metadata)"
    fi

    # Check SMART configuration
    if curl -s --connect-timeout 5 "http://localhost:9088/.well-known/smart-configuration" > /dev/null 2>&1; then
        log_success "SMART configuration endpoint is available"
    else
        log_warning "SMART configuration endpoint not responding"
    fi
}

setup_env_file() {
    if [ ! -f "$ENV_FILE" ]; then
        log_info "Creating .env file from template..."
        cp "${SCRIPT_DIR}/.env.example" "$ENV_FILE"
        log_warning "Please review and update ${ENV_FILE} with your configuration"
    fi
}

# =============================================================================
# Docker Compose Operations
# =============================================================================

start_inferno_core() {
    log_info "Starting Inferno core services (PostgreSQL, Redis, Inferno)..."
    docker compose -f "$COMPOSE_FILE" up -d

    log_info "Waiting for Inferno to be healthy..."
    local retries=30
    local count=0

    while [ $count -lt $retries ]; do
        if curl -s --connect-timeout 2 "http://localhost:4567" > /dev/null 2>&1; then
            log_success "Inferno Core is ready at http://localhost:4567"
            return 0
        fi
        count=$((count + 1))
        echo -n "."
        sleep 2
    done

    log_error "Inferno failed to start within timeout"
    docker compose -f "$COMPOSE_FILE" logs inferno
    exit 1
}

start_onc_program() {
    log_info "Starting ONC Inferno Program (SMART + US Core tests)..."
    docker compose -f "$COMPOSE_FILE" --profile onc up -d onc-program

    log_info "Waiting for ONC Program to be ready..."
    local retries=30
    local count=0

    while [ $count -lt $retries ]; do
        if curl -s --connect-timeout 2 "http://localhost:4568" > /dev/null 2>&1; then
            log_success "ONC Inferno Program ready at http://localhost:4568"
            print_onc_instructions
            return 0
        fi
        count=$((count + 1))
        echo -n "."
        sleep 2
    done

    log_warning "ONC Program may still be starting. Check: docker compose -f $COMPOSE_FILE logs onc-program"
}

start_ips_workflow() {
    log_info "Starting local IPS workflow in the patched Inferno UI..."
    start_inferno_core
    show_status
    print_ips_instructions
}

seed_inferno_test_data() {
    log_info "Seeding local FHIR test data for Inferno..."

    if ! command -v poetry &> /dev/null; then
        log_error "Poetry is required to seed Inferno test data. Install Poetry first."
        exit 1
    fi

    (
        cd "${PROJECT_ROOT}/backend"
        poetry run python manage.py seed_fhir_test_data
    )

    log_success "FHIR test data seeded. Use the printed values for Inferno inputs."
}

start_ips_smoke_workflow() {
    seed_inferno_test_data
    start_ips_workflow
}

teardown() {
    log_info "Stopping and removing all Inferno containers..."
    docker compose -f "$COMPOSE_FILE" down -v

    log_success "Inferno services stopped and removed"
}

show_status() {
    log_info "Inferno Service Status:"
    echo ""
    docker compose -f "$COMPOSE_FILE" ps
    echo ""

    log_info "Service URLs:"
    echo "  - Inferno UI:       http://localhost:4567"
    echo ""

    log_info "Vitora Endpoints (under test):"
    echo "  - FHIR Base:        http://localhost:9088/fhir/"
    echo "  - FHIR Metadata:    http://localhost:9088/fhir/metadata"
    echo "  - SMART Config:     http://localhost:9088/.well-known/smart-configuration"
    echo "  - OAuth Authorize:  http://localhost:9088/oauth/authorize/"
    echo "  - OAuth Token:      http://localhost:9088/oauth/token/"
}

print_ips_instructions() {
    echo ""
    echo "============================================================================="
    echo "                     INFERNO IPS WORKFLOW"
    echo "============================================================================="
    echo ""
    echo "1. Open http://localhost:4567 in your browser"
    echo ""
    echo "2. Choose the International Patient Summary (IPS) suite"
    echo ""
    echo "3. Use the local FHIR server base when prompted:"
    echo "   ${VITORA_URL}"
    echo ""
    echo "4. Seed or refresh the local Inferno IDs before running profile groups:"
    echo "   cd backend && poetry run python manage.py seed_fhir_test_data"
    echo ""
    echo "5. This local workflow depends on the startup patches mounted into the"
    echo "   Inferno container from docker/inferno/start-with-local-patches.sh"
    echo ""
    echo "============================================================================="
}

print_onc_instructions() {
    echo ""
    echo "============================================================================="
    echo "                 ONC INFERNO PROGRAM TEST INSTRUCTIONS"
    echo "============================================================================="
    echo ""
    echo "1. Open http://localhost:4568 in your browser"
    echo ""
    echo "2. Select a test suite:"
    echo "   - SMART App Launch (STU2)"
    echo "   - US Core"
    echo ""
    echo "3. Configure with Vitora endpoints:"
    echo "   - FHIR Server: http://host.docker.internal:9088/fhir"
    echo "   - Authorization: http://host.docker.internal:9088/oauth/authorize/"
    echo "   - Token: http://host.docker.internal:9088/oauth/token/"
    echo ""
    echo "4. Create an OAuth2 test client in Vitora:"
    echo "   cd backend && poetry run python manage.py shell"
    echo ""
    echo "   from oauth2_provider.models import Application"
    echo "   from django.contrib.auth import get_user_model"
    echo "   User = get_user_model()"
    echo "   admin = User.objects.filter(is_superuser=True).first()"
    echo "   Application.objects.create("
    echo "       name='Inferno Test Client',"
    echo "       user=admin,"
    echo "       client_id='inferno-test-client',"
    echo "       client_secret='inferno-test-secret',"
    echo "       client_type='confidential',"
    echo "       authorization_grant_type='authorization-code',"
    echo "       redirect_uris='http://localhost:4568/inferno/oauth2/static/redirect'"
    echo "   )"
    echo ""
    echo "============================================================================="
}

print_core_instructions() {
    echo ""
    echo "============================================================================="
    echo "                     INFERNO CORE INSTRUCTIONS"
    echo "============================================================================="
    echo ""
    echo "Inferno provides the local FHIR testing interface for this repo."
    echo ""
    echo "1. Open http://localhost:4567 in your browser"
    echo ""
    echo "2. The local instance allows you to:"
    echo "   - Validate FHIR resources"
    echo "   - Test FHIR server capabilities"
    echo "   - Run the patched IPS workflow used in local validation"
    echo ""
    echo "For IPS-specific guidance:"
    echo "  ./docker/inferno/run-tests.sh --ips"
    echo ""
    echo "============================================================================="
}

# =============================================================================
# Main Script Logic
# =============================================================================

main() {
    case "${1:-}" in
        --help|-h)
            show_help
            ;;
        --setup)
            check_prerequisites
            setup_env_file
            start_inferno_core
            show_status
            print_core_instructions
            ;;
        --teardown)
            teardown
            ;;
        --status)
            show_status
            ;;
        --ips)
            check_prerequisites
            setup_env_file
            start_ips_workflow
            ;;
        --smoke)
            check_prerequisites
            setup_env_file
            start_ips_smoke_workflow
            ;;
        --onc|--smart|--us-core)
            log_warning "ONC Inferno Program v1.9 has been DEPRECATED (retired June 2022)"
            log_info "Use Inferno Core (http://localhost:4567) instead"
            log_info "Or run IPS Test Kit with: ./run-tests.sh --ips"
            exit 1
            ;;
        *)
            log_info "Vitora HMIS - Inferno FHIR Compliance Testing"
            echo ""
            log_info "Starting default setup (Inferno core only)..."
            check_prerequisites
            setup_env_file
            start_inferno_core
            show_status
            print_core_instructions
            echo ""
            log_info "Use --ips for the local patched IPS workflow, or --help for options"
            ;;
    esac
}

main "$@"
