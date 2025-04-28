import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "Ensure event creation works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const organizer = accounts.get('wallet_1')!;

        // Event parameters
        const eventName = "Blockchain Summit 2025";
        const description = "Annual blockchain technology conference featuring industry leaders";
        const venue = "Tech Convention Center";
        const futureDate = 10000; // Some block height in the future
        const totalTickets = 1000;
        const ticketPrice = 50000000; // 50 STX
        const refundWindow = 144 * 7; // 7 days worth of blocks
        const category = "Technology";

        // Create event
        let block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'create-event',
                [
                    types.utf8(eventName),
                    types.utf8(description),
                    types.utf8(venue),
                    types.uint(futureDate),
                    types.uint(totalTickets),
                    types.uint(ticketPrice),
                    types.uint(refundWindow),
                    types.utf8(category)
                ],
                organizer.address
            )
        ]);

        // Check if event creation was successful
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify event details
        const eventInfo = chain.callReadOnlyFn(
            'event-ticketing',
            'get-event',
            [types.uint(1)],
            deployer.address
        );

        const eventString = eventInfo.result.replace('(some ', '').slice(0, -1);
        assertEquals(eventString.includes(`name: "${eventName}"`), true);
        assertEquals(eventString.includes(`organizer: ${organizer.address}`), true);
        assertEquals(eventString.includes(`venue: "${venue}"`), true);
        assertEquals(eventString.includes(`total-tickets: u${totalTickets}`), true);
        assertEquals(eventString.includes(`tickets-sold: u0`), true);
        assertEquals(eventString.includes(`ticket-price: u${ticketPrice}`), true);
        assertEquals(eventString.includes(`is-active: true`), true);
        assertEquals(eventString.includes(`revenue: u0`), true);

        // Verify organizer data was updated
        const organizerInfo = chain.callReadOnlyFn(
            'event-ticketing',
            'get-organizer-revenue',
            [types.principal(organizer.address)],
            deployer.address
        );

        const organizerString = organizerInfo.result.replace('(some ', '').slice(0, -1);
        assertEquals(organizerString.includes(`events-organized: u1`), true);
        assertEquals(organizerString.includes(`total-revenue: u0`), true);
        assertEquals(organizerString.includes(`pending-withdrawals: u0`), true);

        // Try to create event with invalid parameters

        // 1. Invalid price (too low)
        block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'create-event',
                [
                    types.utf8("Low Price Event"),
                    types.utf8(description),
                    types.utf8(venue),
                    types.uint(futureDate),
                    types.uint(totalTickets),
                    types.uint(100), // Price below minimum
                    types.uint(refundWindow),
                    types.utf8(category)
                ],
                organizer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u5)'); // ERR-INVALID-PRICE

        // 2. Event date in the past
        block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'create-event',
                [
                    types.utf8("Past Event"),
                    types.utf8(description),
                    types.utf8(venue),
                    types.uint(1), // Past block height
                    types.uint(totalTickets),
                    types.uint(ticketPrice),
                    types.uint(refundWindow),
                    types.utf8(category)
                ],
                organizer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u6)'); // ERR-EVENT-EXPIRED

        // 3. Refund window too long
        block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'create-event',
                [
                    types.utf8("Long Refund Event"),
                    types.utf8(description),
                    types.utf8(venue),
                    types.uint(futureDate),
                    types.uint(totalTickets),
                    types.uint(ticketPrice),
                    types.uint(2000000), // Excessively long refund window
                    types.utf8(category)
                ],
                organizer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u5)'); // ERR-INVALID-PRICE
    },
});

Clarinet.test({
    name: "Test ticket purchase and verification",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const organizer = accounts.get('wallet_1')!;
        const attendee1 = accounts.get('wallet_2')!;
        const attendee2 = accounts.get('wallet_3')!;

        // Create an event
        const eventDate = 10000; // Future date
        const totalTickets = 5;
        const ticketPrice = 50000000; // 50 STX

        chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'create-event',
                [
                    types.utf8("Test Event"),
                    types.utf8("Event Description"),
                    types.utf8("Test Venue"),
                    types.uint(eventDate),
                    types.uint(totalTickets),
                    types.uint(ticketPrice),
                    types.uint(144 * 3), // 3 days refund window
                    types.utf8("Test")
                ],
                organizer.address
            )
        ]);

        // Purchase a ticket
        let block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'purchase-ticket',
                [types.uint(1)], // Event ID
                attendee1.address
            )
        ]);

        // Check if purchase was successful
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify ticket was created correctly
        const ticketInfo = chain.callReadOnlyFn(
            'event-ticketing',
            'get-ticket',
            [types.uint(1)], // Ticket ID
            deployer.address
        );

        const ticketString = ticketInfo.result.replace('(some ', '').slice(0, -1);
        assertEquals(ticketString.includes(`event-id: u1`), true);
        assertEquals(ticketString.includes(`owner: ${attendee1.address}`), true);
        assertEquals(ticketString.includes(`purchase-price: u${ticketPrice}`), true);
        assertEquals(ticketString.includes(`is-used: false`), true);
        assertEquals(ticketString.includes(`is-refunded: false`), true);

        // Verify event data was updated
        const eventInfo = chain.callReadOnlyFn(
            'event-ticketing',
            'get-event',
            [types.uint(1)],
            deployer.address
        );

        const eventString = eventInfo.result.replace('(some ', '').slice(0, -1);
        assertEquals(eventString.includes(`tickets-sold: u1`), true);
        assertEquals(eventString.includes(`revenue: u${ticketPrice}`), true);

        // Verify user tickets were updated
        const userTickets = chain.callReadOnlyFn(
            'event-ticketing',
            'get-user-tickets',
            [types.principal(attendee1.address)],
            deployer.address
        );

        const userTicketsString = userTickets.result.replace('(some ', '').slice(0, -1);
        assertEquals(userTicketsString.includes(`owned-tickets: [u1]`), true);

        // Purchase more tickets to test limits
        for (let i = 0; i < 3; i++)
        {
            chain.mineBlock([
                Tx.contractCall(
                    'event-ticketing',
                    'purchase-ticket',
                    [types.uint(1)], // Event ID
                    attendee2.address
                )
            ]);
        }

        // Try to buy ticket when event is sold out (should have 1 left)
        block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'purchase-ticket',
                [types.uint(1)], // Event ID
                attendee1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)'); // This should succeed as there's 1 ticket left

        // Try to buy one more ticket (should fail as sold out)
        block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'purchase-ticket',
                [types.uint(1)], // Event ID
                attendee1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u3)'); // ERR-SOLD-OUT

        // Validate ticket as organizer
        block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'validate-ticket',
                [types.uint(1)], // Ticket ID
                organizer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify ticket is now marked as used
        const validatedTicket = chain.callReadOnlyFn(
            'event-ticketing',
            'get-ticket',
            [types.uint(1)],
            deployer.address
        );

        const validatedTicketString = validatedTicket.result.replace('(some ', '').slice(0, -1);
        assertEquals(validatedTicketString.includes(`is-used: true`), true);

        // Try to validate ticket as non-organizer (should fail)
        block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'validate-ticket',
                [types.uint(2)], // Ticket ID
                attendee1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u1)'); // ERR-NOT-AUTHORIZED

        // Try to validate already used ticket (should fail)
        block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'validate-ticket',
                [types.uint(1)], // Already validated ticket
                organizer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u10)'); // ERR-TICKET-USED
    },
});

Clarinet.test({
    name: "Test ticket refund process",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const organizer = accounts.get('wallet_1')!;
        const attendee = accounts.get('wallet_2')!;

        // Create an event with refund window
        const refundWindow = 144 * 3; // 3 days
        const ticketPrice = 50000000; // 50 STX

        chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'create-event',
                [
                    types.utf8("Refundable Event"),
                    types.utf8("Test refund functionality"),
                    types.utf8("Test Venue"),
                    types.uint(10000), // Future date
                    types.uint(10), // Total tickets
                    types.uint(ticketPrice),
                    types.uint(refundWindow),
                    types.utf8("Test")
                ],
                organizer.address
            )
        ]);

        // Purchase two tickets
        chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'purchase-ticket',
                [types.uint(1)], // Event ID
                attendee.address
            ),
            Tx.contractCall(
                'event-ticketing',
                'purchase-ticket',
                [types.uint(1)], // Event ID
                attendee.address
            )
        ]);

        // Validate one of the tickets
        chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'validate-ticket',
                [types.uint(1)], // First ticket
                organizer.address
            )
        ]);

        // Try to refund validated ticket (should fail)
        let block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'refund-ticket',
                [types.uint(1)], // Validated ticket
                attendee.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u10)'); // ERR-TICKET-USED

        // Refund second ticket (should succeed)
        block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'refund-ticket',
                [types.uint(2)], // Second ticket
                attendee.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify ticket is marked as refunded
        const refundedTicket = chain.callReadOnlyFn(
            'event-ticketing',
            'get-ticket',
            [types.uint(2)],
            deployer.address
        );

        const refundedTicketString = refundedTicket.result.replace('(some ', '').slice(0, -1);
        assertEquals(refundedTicketString.includes(`is-refunded: true`), true);

        // Verify event revenue is updated
        const eventInfo = chain.callReadOnlyFn(
            'event-ticketing',
            'get-event',
            [types.uint(1)],
            deployer.address
        );

        const eventString = eventInfo.result.replace('(some ', '').slice(0, -1);
        assertEquals(eventString.includes(`revenue: u${ticketPrice}`), true); // Only one ticket revenue now

        // Try to refund already refunded ticket (should fail)
        block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'refund-ticket',
                [types.uint(2)], // Already refunded
                attendee.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u10)'); // ERR-TICKET-USED

        // Fast forward past refund window
        for (let i = 0; i < refundWindow + 1; i++)
        {
            chain.mineEmptyBlock();
        }

        // Purchase another ticket
        chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'purchase-ticket',
                [types.uint(1)], // Event ID
                attendee.address
            )
        ]);

        // Try to refund ticket after refund window (should fail)
        block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'refund-ticket',
                [types.uint(3)], // Third ticket
                attendee.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u11)'); // ERR-REFUND-WINDOW-CLOSED
    },
});

Clarinet.test({
    name: "Test contract management functions",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const nonOwner = accounts.get('wallet_1')!;

        // Update platform fee
        const newFee = 8; // 8%
        let block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'update-platform-fee',
                [types.uint(newFee)],
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify platform fee was updated
        const platformFee = chain.callReadOnlyFn(
            'event-ticketing',
            'calculate-platform-fee',
            [types.uint(100000000)], // 100 STX
            deployer.address
        );

        assertEquals(platformFee.result, `u${8000000}`); // 8% of 100 STX = 8 STX

        // Update minimum ticket price
        const newMinPrice = 5000000; // 5 STX
        block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'update-min-ticket-price',
                [types.uint(newMinPrice)],
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Try to update settings as non-owner (should fail)
        block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'update-platform-fee',
                [types.uint(10)],
                nonOwner.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u1)'); // ERR-NOT-AUTHORIZED

        // Try to set invalid platform fee (>100%)
        block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'update-platform-fee',
                [types.uint(101)], // 101%
                deployer.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u5)'); // ERR-INVALID-PRICE

        // Create event with new minimum price
        block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'create-event',
                [
                    types.utf8("Min Price Test Event"),
                    types.utf8("Testing minimum price"),
                    types.utf8("Test Venue"),
                    types.uint(10000), // Future date
                    types.uint(10), // Total tickets
                    types.uint(newMinPrice), // Exactly minimum price
                    types.uint(144), // Refund window
                    types.utf8("Test")
                ],
                nonOwner.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');
    },
});

Clarinet.test({
    name: "Test multiple events and complex ticket scenarios",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const organizer1 = accounts.get('wallet_1')!;
        const organizer2 = accounts.get('wallet_2')!;
        const attendee1 = accounts.get('wallet_3')!;
        const attendee2 = accounts.get('wallet_4')!;

        // Create multiple events by different organizers
        chain.mineBlock([
            // Event 1 by organizer1
            Tx.contractCall(
                'event-ticketing',
                'create-event',
                [
                    types.utf8("Concert Event"),
                    types.utf8("Live music concert"),
                    types.utf8("Music Hall"),
                    types.uint(10000), // Future date
                    types.uint(5), // Limited tickets
                    types.uint(30000000), // 30 STX
                    types.uint(144), // 1 day refund
                    types.utf8("Music")
                ],
                organizer1.address
            ),
            // Event 2 by organizer2
            Tx.contractCall(
                'event-ticketing',
                'create-event',
                [
                    types.utf8("Tech Workshop"),
                    types.utf8("Hands-on blockchain workshop"),
                    types.utf8("Tech Campus"),
                    types.uint(20000), // Future date
                    types.uint(20), // More tickets
                    types.uint(20000000), // 20 STX
                    types.uint(288), // 2 days refund
                    types.utf8("Technology")
                ],
                organizer2.address
            )
        ]);

        // Purchase tickets for both events by both attendees
        chain.mineBlock([
            // Attendee1 buys tickets for both events
            Tx.contractCall(
                'event-ticketing',
                'purchase-ticket',
                [types.uint(1)], // Concert
                attendee1.address
            ),
            Tx.contractCall(
                'event-ticketing',
                'purchase-ticket',
                [types.uint(2)], // Workshop
                attendee1.address
            ),
            // Attendee2 buys tickets for both events
            Tx.contractCall(
                'event-ticketing',
                'purchase-ticket',
                [types.uint(1)], // Concert
                attendee2.address
            ),
            Tx.contractCall(
                'event-ticketing',
                'purchase-ticket',
                [types.uint(2)], // Workshop
                attendee2.address
            )
        ]);

        // Verify user tickets list contains tickets from different events
        const attendee1Tickets = chain.callReadOnlyFn(
            'event-ticketing',
            'get-user-tickets',
            [types.principal(attendee1.address)],
            deployer.address
        );

        const attendee1TicketsString = attendee1Tickets.result.replace('(some ', '').slice(0, -1);
        assertEquals(attendee1TicketsString.includes('owned-tickets: [u1, u2]'), true);

        // Verify organizer revenue data
        let organizer1Revenue = chain.callReadOnlyFn(
            'event-ticketing',
            'get-organizer-revenue',
            [types.principal(organizer1.address)],
            deployer.address
        );

        let organizer1RevenueString = organizer1Revenue.result.replace('(some ', '').slice(0, -1);
        assertEquals(organizer1RevenueString.includes('events-organized: u1'), true);

        let organizer2Revenue = chain.callReadOnlyFn(
            'event-ticketing',
            'get-organizer-revenue',
            [types.principal(organizer2.address)],
            deployer.address
        );

        let organizer2RevenueString = organizer2Revenue.result.replace('(some ', '').slice(0, -1);
        assertEquals(organizer2RevenueString.includes('events-organized: u1'), true);

        // Validate tickets for different events
        chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'validate-ticket',
                [types.uint(1)], // Attendee1's concert ticket
                organizer1.address
            ),
            Tx.contractCall(
                'event-ticketing',
                'validate-ticket',
                [types.uint(2)], // Attendee1's workshop ticket
                organizer2.address
            )
        ]);

        // Verify only correct tickets were validated
        const ticket1Info = chain.callReadOnlyFn(
            'event-ticketing',
            'get-ticket',
            [types.uint(1)],
            deployer.address
        );

        const ticket1String = ticket1Info.result.replace('(some ', '').slice(0, -1);
        assertEquals(ticket1String.includes('is-used: true'), true);

        const ticket3Info = chain.callReadOnlyFn(
            'event-ticketing',
            'get-ticket',
            [types.uint(3)],
            deployer.address
        );

        const ticket3String = ticket3Info.result.replace('(some ', '').slice(0, -1);
        assertEquals(ticket3String.includes('is-used: false'), true);

        // Try cross-validation (organizer1 tries to validate workshop ticket)
        let block = chain.mineBlock([
            Tx.contractCall(
                'event-ticketing',
                'validate-ticket',
                [types.uint(4)], // Attendee2's workshop ticket
                organizer1.address
            )
        ]);

        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(err u1)'); // ERR-NOT-AUTHORIZED
    },
});